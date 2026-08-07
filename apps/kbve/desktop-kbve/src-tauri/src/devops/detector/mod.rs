pub mod claude;
pub mod codex;
pub mod generic;
pub mod hysteresis;

use serde::{Deserialize, Serialize};
use specta::Type;
use std::time::{Duration, SystemTime};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
pub enum AgentActivity {
    Running,
    Waiting,
    Done,
    Idle,
    Error,
    #[default]
    Unknown,
}

pub struct DetectContext<'a> {
    pub ansi: &'a [u8],
    pub plain: &'a str,
    pub activity_age: Duration,
    pub previous: Option<AgentActivity>,
    #[allow(dead_code)]
    pub session_name: &'a str,
    pub pane_title: Option<&'a str>,
    pub pane_command: Option<&'a str>,
}

impl<'a> DetectContext<'a> {
    #[allow(clippy::too_many_arguments)]
    pub fn from_parts(
        ansi: &'a [u8],
        plain: &'a str,
        last_activity: Option<SystemTime>,
        now: SystemTime,
        previous: Option<AgentActivity>,
        session_name: &'a str,
        pane_title: Option<&'a str>,
        pane_command: Option<&'a str>,
    ) -> Self {
        let activity_age = match last_activity {
            Some(ts) => now.duration_since(ts).unwrap_or(Duration::ZERO),
            None => Duration::from_secs(u64::MAX / 2),
        };
        Self {
            ansi,
            plain,
            activity_age,
            previous,
            session_name,
            pane_title,
            pane_command,
        }
    }
}

pub fn is_braille(c: char) -> bool {
    ('\u{2800}'..='\u{28ff}').contains(&c)
}

pub fn title_is_working(title: &str) -> bool {
    title.chars().take(4).any(is_braille)
}

pub const BOTTOM_REGION_LINES: usize = 12;

pub fn bottom_region(plain: &str) -> String {
    let mut lines: Vec<&str> = plain
        .lines()
        .rev()
        .filter(|l| !l.trim().is_empty())
        .take(BOTTOM_REGION_LINES)
        .collect();
    lines.reverse();
    lines.join("\n")
}

pub trait StatusDetector: Send + Sync {
    fn name(&self) -> &'static str;
    fn detect(&self, ctx: &DetectContext<'_>) -> AgentActivity;
    fn priority(&self) -> u8;
}

pub struct DetectorRegistry {
    detectors: Vec<Box<dyn StatusDetector>>,
}

impl DetectorRegistry {
    pub fn new() -> Self {
        Self {
            detectors: Vec::new(),
        }
    }

    pub fn register(mut self, d: Box<dyn StatusDetector>) -> Self {
        self.detectors.push(d);
        self.detectors
            .sort_by_key(|d| std::cmp::Reverse(d.priority()));
        self
    }

    pub fn default_stack() -> Self {
        Self::new()
            .register(Box::new(claude::ClaudeDetector))
            .register(Box::new(codex::CodexDetector))
            .register(Box::new(generic::GenericDetector))
    }

    pub fn detect(&self, ctx: &DetectContext<'_>) -> AgentActivity {
        for d in &self.detectors {
            let s = d.detect(ctx);
            if s != AgentActivity::Unknown {
                return s;
            }
        }
        AgentActivity::Unknown
    }
}

impl Default for DetectorRegistry {
    fn default() -> Self {
        Self::default_stack()
    }
}

pub fn strip_ansi(bytes: &[u8]) -> String {
    let s = String::from_utf8_lossy(bytes);
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            match chars.peek() {
                Some('[') => {
                    chars.next();
                    for ch in chars.by_ref() {
                        if ('\x40'..='\x7e').contains(&ch) {
                            break;
                        }
                    }
                }
                Some(']') => {
                    chars.next();
                    while let Some(ch) = chars.next() {
                        if ch == '\x07' {
                            break;
                        }
                        if ch == '\x1b' {
                            let _ = chars.next();
                            break;
                        }
                    }
                }
                Some(&c2) if ('\x40'..='\x5f').contains(&c2) => {
                    chars.next();
                }
                _ => {}
            }
            continue;
        }
        out.push(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_ansi_removes_csi() {
        assert_eq!(strip_ansi(b"\x1b[31mred\x1b[0m plain"), "red plain");
    }

    #[test]
    fn strip_ansi_removes_osc_bel_terminated() {
        assert_eq!(strip_ansi(b"before\x1b]0;title\x07after"), "beforeafter");
    }

    #[test]
    fn strip_ansi_removes_osc_st_terminated() {
        assert_eq!(strip_ansi(b"before\x1b]0;title\x1b\\after"), "beforeafter");
    }

    #[test]
    fn strip_ansi_preserves_unicode() {
        assert_eq!(
            strip_ansi("日本語 \x1b[1mbold\x1b[0m".as_bytes()),
            "日本語 bold"
        );
    }

    #[test]
    fn registry_picks_first_non_unknown_by_priority() {
        struct Fake {
            name: &'static str,
            prio: u8,
            answer: AgentActivity,
        }
        impl StatusDetector for Fake {
            fn name(&self) -> &'static str {
                self.name
            }
            fn priority(&self) -> u8 {
                self.prio
            }
            fn detect(&self, _: &DetectContext<'_>) -> AgentActivity {
                self.answer
            }
        }
        let r = DetectorRegistry::new()
            .register(Box::new(Fake {
                name: "low",
                prio: 10,
                answer: AgentActivity::Idle,
            }))
            .register(Box::new(Fake {
                name: "high_unknown",
                prio: 100,
                answer: AgentActivity::Unknown,
            }))
            .register(Box::new(Fake {
                name: "mid",
                prio: 50,
                answer: AgentActivity::Running,
            }));
        let now = SystemTime::now();
        let ctx = DetectContext::from_parts(b"", "", Some(now), now, None, "x", None, None);
        assert_eq!(r.detect(&ctx), AgentActivity::Running);
    }

    #[test]
    fn title_spinner_frame_reads_as_working() {
        assert!(title_is_working("⠙ Fix the parser bug"));
        assert!(title_is_working("⠂ Fix status icon flickering"));
    }

    #[test]
    fn title_star_glyph_is_not_working() {
        assert!(!title_is_working("✳ Investigate GitHub issue 13"));
        assert!(!title_is_working("2 awaiting input · claude agents"));
        assert!(!title_is_working("hades-2.local"));
    }

    #[test]
    fn braille_deep_in_a_title_is_not_a_spinner() {
        assert!(!title_is_working("Fix the ⠙ renderer bug"));
    }
}
