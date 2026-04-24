//! Server-side markdown renderer for forum / user-generated content.
//!
//! Pipeline:
//! 1. Parse CommonMark + GFM via pulldown-cmark.
//! 2. Strip every `Event::Html` / `Event::InlineHtml` — raw HTML passthrough
//!    is the biggest XSS source in markdown; we disallow it entirely.
//! 3. Extract mentions (`@username`) and hashtags (`#slug`) during the parse,
//!    skipping content inside code blocks and code spans.
//! 4. Render the filtered event stream to HTML.
//! 5. Sanitize the rendered HTML through ammonia with a tight allowlist:
//!    only commonmark-relevant tags, http/https/mailto URL schemes,
//!    `rel="noopener noreferrer"` + `target="_blank"` on links.
//! 6. Image hosts are validated against the supplied allowlist — any `<img>`
//!    whose host is not approved gets dropped.
//!
//! Storage pattern: persist raw markdown, render + sanitize on read. Cache
//! output in app layer keyed by `(content_id, revision_count, SANITIZER_VERSION)`
//! so re-renders pick up sanitizer policy tightening.

use ammonia::{Builder, UrlRelative};
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd, html};
use std::collections::HashSet;
use url::Url;

/// Bump whenever the allowlist, option set, or any rendering behavior
/// changes. Used as part of the cache key so callers invalidate on upgrade.
pub const SANITIZER_VERSION: u32 = 1;

/// Context passed into `render`. Holds policy knobs (image host allowlist,
/// mention/hashtag extraction on/off) that the caller picks per-surface.
pub struct RenderCtx<'a> {
    /// Host suffixes allowed on `<img>` elements. Empty allowlist blocks
    /// ALL external images; supply `&["kbve.com", "supabase.co", …]` to
    /// permit specific CDNs. Relative paths (no host) always pass.
    pub allowed_image_hosts: &'a [&'a str],
    /// Extract `@username` / `#hashtag` tokens during parse.
    pub extract_mentions: bool,
    pub extract_hashtags: bool,
}

impl<'a> Default for RenderCtx<'a> {
    fn default() -> Self {
        Self {
            allowed_image_hosts: &[],
            extract_mentions: true,
            extract_hashtags: true,
        }
    }
}

/// Output of a render pass.
#[derive(Debug, Clone, Default)]
pub struct Rendered {
    pub html: String,
    pub mentions: Vec<String>,
    pub hashtags: Vec<String>,
}

/// Render user-supplied markdown to sanitized HTML.
///
/// Safe to hand directly to a browser via `innerHTML` / `set:html` — the
/// ammonia allowlist blocks every tag/attribute/URL scheme that can execute
/// script.
pub fn render(raw: &str, ctx: &RenderCtx<'_>) -> Rendered {
    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    opts.insert(Options::ENABLE_TASKLISTS);
    opts.insert(Options::ENABLE_FOOTNOTES);
    opts.insert(Options::ENABLE_SMART_PUNCTUATION);
    // Do NOT enable raw-HTML passthrough — pulldown-cmark still emits
    // Event::Html for inline HTML in the source, which we filter out below.

    let parser = Parser::new_ext(raw, opts);

    let mut mentions: Vec<String> = Vec::new();
    let mut hashtags: Vec<String> = Vec::new();
    let mut in_code = 0u32;

    let filtered: Vec<Event> = parser
        .filter_map(|event| match event {
            Event::Html(_) | Event::InlineHtml(_) => None,
            Event::Start(Tag::CodeBlock(_)) => {
                in_code += 1;
                Some(event)
            }
            Event::End(TagEnd::CodeBlock) => {
                in_code = in_code.saturating_sub(1);
                Some(event)
            }
            Event::Code(ref _s) => Some(event),
            Event::Text(ref text) if in_code == 0 => {
                if ctx.extract_mentions {
                    scan_mentions(text, &mut mentions);
                }
                if ctx.extract_hashtags {
                    scan_hashtags(text, &mut hashtags);
                }
                Some(event.clone())
            }
            _ => Some(event),
        })
        .collect();

    let mut raw_html = String::with_capacity(raw.len() * 2);
    html::push_html(&mut raw_html, filtered.into_iter());

    let html = sanitize(&raw_html, ctx);

    dedup_in_place(&mut mentions);
    dedup_in_place(&mut hashtags);

    Rendered {
        html,
        mentions,
        hashtags,
    }
}

fn dedup_in_place(v: &mut Vec<String>) {
    let mut seen = HashSet::new();
    v.retain(|item| seen.insert(item.clone()));
}

/// Extract `@username` tokens. Username shape: alphanumeric + underscore,
/// starts with a letter, 3–24 chars (matches `kbve.profile.UserProfile.username`).
fn scan_mentions(text: &str, out: &mut Vec<String>) {
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'@' {
            // Must be at start or preceded by non-word char.
            let at_boundary =
                i == 0 || !bytes[i - 1].is_ascii_alphanumeric() && bytes[i - 1] != b'_';
            if at_boundary {
                let start = i + 1;
                if start < bytes.len() && bytes[start].is_ascii_alphabetic() {
                    let mut end = start + 1;
                    while end < bytes.len()
                        && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'_')
                    {
                        end += 1;
                    }
                    let len = end - start;
                    if (3..=24).contains(&len) {
                        // SAFETY: we only advanced over ASCII bytes.
                        out.push(text[start..end].to_ascii_lowercase());
                        i = end;
                        continue;
                    }
                }
            }
        }
        i += 1;
    }
}

/// Extract `#tag-slug` tokens. Slug shape: lowercase alphanumeric + hyphen,
/// starts with alphanumeric, 1–50 chars (matches `forum.tags.slug`).
fn scan_hashtags(text: &str, out: &mut Vec<String>) {
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'#' {
            let at_boundary =
                i == 0 || !bytes[i - 1].is_ascii_alphanumeric() && bytes[i - 1] != b'_';
            if at_boundary {
                let start = i + 1;
                if start < bytes.len() && bytes[start].is_ascii_alphanumeric() {
                    let mut end = start + 1;
                    while end < bytes.len()
                        && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'-')
                    {
                        end += 1;
                    }
                    let len = end - start;
                    if (1..=50).contains(&len) {
                        out.push(text[start..end].to_ascii_lowercase());
                        i = end;
                        continue;
                    }
                }
            }
        }
        i += 1;
    }
}

/// Apply ammonia allowlist to the rendered HTML.
fn sanitize(html_in: &str, ctx: &RenderCtx<'_>) -> String {
    let mut schemes: HashSet<&str> = HashSet::new();
    schemes.insert("http");
    schemes.insert("https");
    schemes.insert("mailto");

    let allowed_hosts: Vec<String> = ctx
        .allowed_image_hosts
        .iter()
        .map(|s| s.to_string())
        .collect();

    let mut builder = Builder::default();
    builder
        .url_schemes(schemes)
        .url_relative(UrlRelative::PassThrough)
        .link_rel(Some("noopener noreferrer"))
        .add_generic_attributes([
            "data-mention",
            "data-hashtag",
            "data-user-id",
            "data-tag-id",
        ])
        .add_tag_attributes("a", ["target"])
        .add_tag_attributes("img", ["alt", "title", "width", "height", "loading"])
        .add_tag_attributes("code", ["class"])
        .add_tag_attributes("span", ["class"])
        .attribute_filter(
            move |element, attribute, value| match (element, attribute) {
                ("img", "src") => {
                    if is_image_host_allowed(value, &allowed_hosts) {
                        Some(value.into())
                    } else {
                        None
                    }
                }
                _ => Some(value.into()),
            },
        );

    builder.clean(html_in).to_string()
}

fn is_image_host_allowed(url_str: &str, allowed: &[String]) -> bool {
    // Relative paths always allowed.
    if !url_str.contains("://") {
        return !url_str.trim().is_empty();
    }
    let parsed = match Url::parse(url_str) {
        Ok(u) => u,
        Err(_) => return false,
    };
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return false;
    }
    let host = match parsed.host_str() {
        Some(h) => h.to_ascii_lowercase(),
        None => return false,
    };
    if allowed.is_empty() {
        return false; // Empty allowlist = block every external image.
    }
    for suffix in allowed {
        let s = suffix.trim_start_matches('.').to_ascii_lowercase();
        if host == s || host.ends_with(&format!(".{s}")) {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_ctx() -> RenderCtx<'static> {
        RenderCtx::default()
    }

    #[test]
    fn basic_markdown_renders() {
        let out = render("# hello\n\nworld", &default_ctx());
        assert!(out.html.contains("<h1>hello</h1>"));
        assert!(out.html.contains("<p>world</p>"));
    }

    #[test]
    fn strips_raw_script_tag() {
        let out = render("<script>alert(1)</script>", &default_ctx());
        assert!(!out.html.contains("<script"));
        assert!(!out.html.contains("alert"));
    }

    #[test]
    fn strips_inline_html_event_handlers() {
        let out = render("<div onclick=\"pwn()\">x</div>", &default_ctx());
        assert!(!out.html.contains("onclick"));
        assert!(!out.html.contains("<div"));
    }

    #[test]
    fn blocks_javascript_href() {
        let out = render("[click](javascript:alert(1))", &default_ctx());
        assert!(!out.html.contains("javascript"));
    }

    #[test]
    fn blocks_data_uri_image() {
        let out = render(
            "![x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
            &default_ctx(),
        );
        assert!(!out.html.contains("data:"));
    }

    #[test]
    fn allows_https_link_with_noopener() {
        let out = render("[link](https://kbve.com)", &default_ctx());
        assert!(out.html.contains("https://kbve.com"));
        assert!(out.html.contains("rel=\"noopener noreferrer\""));
    }

    #[test]
    fn restricts_image_to_allowed_hosts() {
        let ctx = RenderCtx {
            allowed_image_hosts: &["kbve.com"],
            ..RenderCtx::default()
        };
        let ok = render("![logo](https://cdn.kbve.com/logo.png)", &ctx);
        assert!(ok.html.contains("<img"));
        assert!(ok.html.contains("cdn.kbve.com"));
        let blocked = render("![evil](https://evil.example/x.gif)", &ctx);
        assert!(!blocked.html.contains("evil.example"));
    }

    #[test]
    fn relative_image_paths_always_allowed() {
        let ctx = RenderCtx::default();
        let out = render("![local](/images/hero.png)", &ctx);
        assert!(out.html.contains("/images/hero.png"));
    }

    #[test]
    fn extracts_mentions_once() {
        let out = render("hi @alice and @bob and @alice", &default_ctx());
        assert_eq!(out.mentions, vec!["alice".to_string(), "bob".to_string()]);
    }

    #[test]
    fn ignores_mentions_in_code_blocks() {
        let out = render("```\n@alice\n```\n\n@bob", &default_ctx());
        assert_eq!(out.mentions, vec!["bob".to_string()]);
    }

    #[test]
    fn extracts_hashtags() {
        let out = render("check out #gamedev and #rust-lang", &default_ctx());
        assert_eq!(
            out.hashtags,
            vec!["gamedev".to_string(), "rust-lang".to_string()]
        );
    }

    #[test]
    fn mentions_require_alpha_start() {
        let out = render("email foo@bar.com is not a mention", &default_ctx());
        assert!(out.mentions.is_empty());
    }

    #[test]
    fn blocks_style_and_form_tags() {
        let out = render(
            "<style>body{display:none}</style><form><input></form>",
            &default_ctx(),
        );
        assert!(!out.html.contains("<style"));
        assert!(!out.html.contains("<form"));
        assert!(!out.html.contains("<input"));
    }

    #[test]
    fn preserves_code_block_fences_and_content() {
        let out = render(
            "```rust\nfn main() { println!(\"hi\"); }\n```",
            &default_ctx(),
        );
        assert!(out.html.contains("<pre>"));
        assert!(out.html.contains("<code"));
        assert!(out.html.contains("fn main()"));
    }

    #[test]
    fn task_list_checkboxes_stripped_but_text_preserved() {
        // ammonia's default allowlist drops `<input>` — the right call for
        // user-generated content (prevents form-injection). Task-list checkbox
        // markers are discarded; the list text around them survives.
        let out = render("- [x] done\n- [ ] todo", &default_ctx());
        assert!(!out.html.contains("<input"));
        assert!(out.html.contains("done"));
        assert!(out.html.contains("todo"));
    }

    #[test]
    fn tables_supported() {
        let out = render("| a | b |\n|---|---|\n| 1 | 2 |", &default_ctx());
        assert!(out.html.contains("<table>"));
        assert!(out.html.contains("<thead>"));
    }

    #[test]
    fn long_mention_rejected() {
        let out = render(
            "@a-very-long-username-that-exceeds-twenty-four-chars",
            &default_ctx(),
        );
        // `@a` starts alpha but full slug length is 3-24 chars of [A-Za-z0-9_].
        // The above uses hyphens which don't match the mention grammar, so
        // parser stops at "a" (1 char, below 3 min).
        assert!(out.mentions.is_empty());
    }

    #[test]
    fn image_allowed_host_matches_subdomain() {
        let ctx = RenderCtx {
            allowed_image_hosts: &["kbve.com"],
            ..RenderCtx::default()
        };
        let out = render("![x](https://deep.cdn.kbve.com/x.png)", &ctx);
        assert!(out.html.contains("deep.cdn.kbve.com"));
    }

    #[test]
    fn image_scheme_must_be_http_or_https() {
        let ctx = RenderCtx {
            allowed_image_hosts: &["kbve.com"],
            ..RenderCtx::default()
        };
        let out = render("![x](ftp://kbve.com/x.png)", &ctx);
        assert!(!out.html.contains("ftp:"));
    }
}
