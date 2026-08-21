//! SOAP-over-HTTP client for the AzerothCore / ToCloud9 worldserver.
//!
//! The worldserver's SOAP surface is a single `executeCommand` operation:
//! POST an envelope carrying a dot-stripped GM command line, get the command's
//! console output back inside `<result>`. There is no WSDL negotiation, no
//! session, no keep-alive semantics worth modelling — so this is a hand-rolled
//! envelope plus a substring extractor rather than a generic SOAP stack.
//!
//! There is no XML crate anywhere in this Rust workspace and adding one to
//! parse two known-shape elements would be a poor trade. Instead the wire
//! layer is split so the parsing is a pure, unit-testable string function:
//! `build_envelope` in, `parse_response` out, with `reqwest` only in between.

use std::sync::OnceLock;
use std::time::Duration;

use thiserror::Error;

const SOAP_TIMEOUT: Duration = Duration::from_secs(15);

/// Resolved SOAP endpoint. Credentials are a GM account's login — the
/// worldserver authenticates SOAP with HTTP Basic against the auth DB and
/// then authorizes each command against that account's seclevel.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SoapEndpoint {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
}

impl SoapEndpoint {
    pub fn new(
        host: impl Into<String>,
        port: u16,
        user: impl Into<String>,
        password: impl Into<String>,
    ) -> Self {
        Self {
            host: host.into(),
            port,
            user: user.into(),
            password: password.into(),
        }
    }

    pub fn url(&self) -> String {
        format!("http://{}:{}/", self.host, self.port)
    }
}

#[derive(Debug, Error)]
pub enum SoapError {
    #[error("soap transport: {0}")]
    Http(String),

    #[error("soap http {status}: {body}")]
    Status { status: u16, body: String },

    #[error("soap fault: {0}")]
    Fault(String),

    #[error("soap response was not parseable: {0}")]
    Malformed(String),
}

/// A worldserver that accepts the connection but never answers would otherwise
/// pin an axum task forever, so the client carries its own timeout rather than
/// relying on the caller to bound it.
fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(SOAP_TIMEOUT)
            .build()
            .unwrap_or_default()
    })
}

pub async fn exec(endpoint: &SoapEndpoint, command: &str) -> Result<String, SoapError> {
    let body = build_envelope(command);
    let res = client()
        .post(endpoint.url())
        .basic_auth(&endpoint.user, Some(&endpoint.password))
        .header("Content-Type", "application/xml; charset=utf-8")
        .header("SOAPAction", "urn:AC#executeCommand")
        .body(body)
        .send()
        .await
        .map_err(|e| SoapError::Http(e.to_string()))?;

    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| SoapError::Http(e.to_string()))?;

    // A SOAP fault arrives as HTTP 500 with a usable faultstring, so the
    // body is worth parsing before the status is treated as fatal.
    match parse_response(&text) {
        Ok(out) => Ok(out),
        Err(SoapError::Malformed(m)) if !status.is_success() => Err(SoapError::Status {
            status: status.as_u16(),
            body: if text.is_empty() { m } else { truncate(&text) },
        }),
        Err(e) => Err(e),
    }
}

fn truncate(s: &str) -> String {
    const MAX: usize = 512;
    if s.len() <= MAX {
        return s.to_string();
    }
    let mut end = MAX;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &s[..end])
}

pub fn build_envelope(command: &str) -> String {
    format!(
        concat!(
            "<SOAP-ENV:Envelope ",
            "xmlns:SOAP-ENV=\"http://schemas.xmlsoap.org/soap/envelope/\" ",
            "xmlns:ns1=\"urn:AC\">",
            "<SOAP-ENV:Body><ns1:executeCommand><command>{}</command>",
            "</ns1:executeCommand></SOAP-ENV:Body></SOAP-ENV:Envelope>"
        ),
        xml_escape(command)
    )
}

/// Pull the GM command output out of a response envelope, or turn a SOAP
/// fault into an error. Success and fault are mutually exclusive on the wire,
/// but a fault is checked first: a server that emits both is misbehaving and
/// the safe reading is "this did not run".
pub fn parse_response(xml: &str) -> Result<String, SoapError> {
    if let Some(fault) = extract_tag(xml, "faultstring") {
        let detail = extract_tag(xml, "detail").unwrap_or_default();
        let fault = xml_unescape(&fault);
        let detail = xml_unescape(&detail);
        return Err(SoapError::Fault(if detail.trim().is_empty() {
            fault
        } else {
            format!("{fault}: {detail}")
        }));
    }
    match extract_tag(xml, "result") {
        Some(raw) => Ok(xml_unescape(&raw)),
        None => Err(SoapError::Malformed(
            "no <result> or <faultstring> element in response".into(),
        )),
    }
}

/// Locate `<name ...>…</name>`, tolerating a namespace prefix and attributes.
/// Self-closing (`<result/>`) reads as empty content.
fn extract_tag(xml: &str, name: &str) -> Option<String> {
    let mut cursor = 0usize;
    while let Some(rel) = xml[cursor..].find('<') {
        let open_lt = cursor + rel;
        let rest = &xml[open_lt + 1..];
        let name_end = rest
            .find(|c: char| c == '>' || c == '/' || c.is_whitespace())
            .unwrap_or(rest.len());
        let tag = &rest[..name_end];
        let local = tag.rsplit(':').next().unwrap_or(tag);
        if local != name {
            cursor = open_lt + 1;
            continue;
        }
        let gt = match rest.find('>') {
            Some(g) => open_lt + 1 + g,
            None => return None,
        };
        if xml[open_lt..gt].ends_with('/') {
            return Some(String::new());
        }
        let content_start = gt + 1;
        let close = format!("</{tag}>");
        return xml[content_start..]
            .find(&close)
            .map(|rel_close| xml[content_start..content_start + rel_close].to_string());
    }
    None
}

pub fn xml_escape(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for c in raw.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

/// Reverse of `xml_escape`, plus the numeric character references the
/// worldserver's gSOAP emits for non-ASCII console output. An unrecognised
/// `&…;` run is passed through verbatim rather than dropped — losing bytes
/// from an audit trail is worse than showing a stray entity.
pub fn xml_unescape(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let bytes: Vec<char> = raw.chars().collect();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] != '&' {
            out.push(bytes[i]);
            i += 1;
            continue;
        }
        let end = bytes[i + 1..]
            .iter()
            .position(|c| *c == ';')
            .map(|p| i + 1 + p);
        let Some(end) = end.filter(|e| *e - i <= 10) else {
            out.push('&');
            i += 1;
            continue;
        };
        let entity: String = bytes[i + 1..end].iter().collect();
        let decoded = match entity.as_str() {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            other => other
                .strip_prefix('#')
                .and_then(|n| match n.strip_prefix(['x', 'X']) {
                    Some(hex) => u32::from_str_radix(hex, 16).ok(),
                    None => n.parse::<u32>().ok(),
                })
                .and_then(char::from_u32),
        };
        match decoded {
            Some(c) => {
                out.push(c);
                i = end + 1;
            }
            None => {
                out.push('&');
                i += 1;
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_carries_the_command() {
        let env = build_envelope("server info");
        assert!(env.contains("<command>server info</command>"));
        assert!(env.contains("xmlns:ns1=\"urn:AC\""));
        assert!(env.starts_with("<SOAP-ENV:Envelope"));
        assert!(env.ends_with("</SOAP-ENV:Envelope>"));
    }

    #[test]
    fn envelope_escapes_metacharacters() {
        let env = build_envelope("announce a<b & c>\"d\"");
        assert!(env.contains("<command>announce a&lt;b &amp; c&gt;&quot;d&quot;</command>"));
        assert!(!env.contains("a<b"));
    }

    #[test]
    fn parse_response_extracts_result() {
        let xml = "<SOAP-ENV:Envelope><SOAP-ENV:Body><ns1:executeCommandResponse>\
                   <result>AzerothCore rev. 1234</result>\
                   </ns1:executeCommandResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>";
        assert_eq!(parse_response(xml).unwrap(), "AzerothCore rev. 1234");
    }

    #[test]
    fn parse_response_unescapes_entities() {
        let xml = "<result>Players online: 3 &lt;of&gt; 10 &amp; rising &#65;&#x42;</result>";
        assert_eq!(
            parse_response(xml).unwrap(),
            "Players online: 3 <of> 10 & rising AB"
        );
    }

    #[test]
    fn parse_response_handles_namespaced_and_attributed_result() {
        let xml = "<ns1:result xsi:type=\"xsd:string\">ok</ns1:result>";
        assert_eq!(parse_response(xml).unwrap(), "ok");
    }

    #[test]
    fn parse_response_handles_empty_and_self_closing_result() {
        assert_eq!(parse_response("<result></result>").unwrap(), "");
        assert_eq!(parse_response("<result/>").unwrap(), "");
    }

    #[test]
    fn parse_response_surfaces_faultstring() {
        let xml = "<SOAP-ENV:Fault><faultcode>SOAP-ENV:Client</faultcode>\
                   <faultstring>Command not found</faultstring></SOAP-ENV:Fault>";
        match parse_response(xml) {
            Err(SoapError::Fault(m)) => assert_eq!(m, "Command not found"),
            other => panic!("expected fault, got {other:?}"),
        }
    }

    #[test]
    fn parse_response_joins_fault_detail() {
        let xml = "<faultstring>Access denied</faultstring><detail>seclevel &lt; 3</detail>";
        match parse_response(xml) {
            Err(SoapError::Fault(m)) => assert_eq!(m, "Access denied: seclevel < 3"),
            other => panic!("expected fault, got {other:?}"),
        }
    }

    #[test]
    fn parse_response_prefers_fault_over_result() {
        let xml = "<result>partial</result><faultstring>boom</faultstring>";
        assert!(matches!(parse_response(xml), Err(SoapError::Fault(_))));
    }

    #[test]
    fn parse_response_rejects_malformed_xml() {
        assert!(matches!(
            parse_response("<html><body>502 Bad Gateway</body></html>"),
            Err(SoapError::Malformed(_))
        ));
        assert!(matches!(parse_response(""), Err(SoapError::Malformed(_))));
        assert!(matches!(
            parse_response("<result>never closed"),
            Err(SoapError::Malformed(_))
        ));
    }

    #[test]
    fn unescape_passes_unknown_entities_through() {
        assert_eq!(xml_unescape("100% &nope; &"), "100% &nope; &");
        assert_eq!(xml_unescape("a &amp;amp; b"), "a &amp; b");
    }

    #[test]
    fn escape_unescape_round_trips() {
        let raw = "kick <bob> & \"friends\" it's 100%";
        assert_eq!(xml_unescape(&xml_escape(raw)), raw);
    }

    #[test]
    fn endpoint_url_is_root_http() {
        let ep = SoapEndpoint::new("worldserver", 7878, "gm", "pw");
        assert_eq!(ep.url(), "http://worldserver:7878/");
    }
}
