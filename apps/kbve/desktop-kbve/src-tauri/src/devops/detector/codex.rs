use std::time::Duration;

use super::{bottom_region, is_braille, AgentActivity, DetectContext, StatusDetector};

pub struct CodexDetector;

impl StatusDetector for CodexDetector {
    fn name(&self) -> &'static str {
        "codex"
    }

    fn priority(&self) -> u8 {
        90
    }

    fn detect(&self, ctx: &DetectContext<'_>) -> AgentActivity {
        let bottom = bottom_region(ctx.plain);

        if !looks_like_codex(ctx.plain, &bottom) {
            return AgentActivity::Unknown;
        }

        if has_prompt_marker(&bottom) {
            return AgentActivity::Waiting;
        }

        if has_activity_marker(&bottom) || has_spinner_title(ctx.ansi) {
            return AgentActivity::Running;
        }

        if ctx.activity_age < Duration::from_secs(3) {
            return AgentActivity::Running;
        }

        AgentActivity::Idle
    }
}

fn looks_like_codex(plain: &str, bottom: &str) -> bool {
    plain.contains("OpenAI Codex")
        || plain.contains("codex-cli")
        || plain.contains("Codex")
        || bottom.contains("codex")
}

fn has_prompt_marker(region: &str) -> bool {
    const PROMPTS: &[&str] = &[
        "Do you want to",
        "Would you like to",
        "Choose an option",
        "Press any key to continue",
        "(y/n)",
        "(Y/n)",
        "(y/N)",
        "approve",
        "Approve",
        "deny",
        "Deny",
    ];
    PROMPTS.iter().any(|p| region.contains(p))
}

fn has_activity_marker(region: &str) -> bool {
    const VERBS: &[&str] = &[
        "Thinking",
        "Working",
        "Running",
        "Executing",
        "Generating",
        "Applying",
        "Searching",
        "Reading",
        "Writing",
        "Reasoning",
    ];
    VERBS
        .iter()
        .any(|v| region.contains(&format!("{}…", v)) || region.contains(&format!("{}...", v)))
}

fn has_spinner_title(ansi: &[u8]) -> bool {
    let s = String::from_utf8_lossy(ansi);
    let mut in_title = false;
    let mut title = String::new();
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            if chars.next() == Some(']') {
                for _ in 0..2 {
                    chars.next();
                }
                in_title = true;
                title.clear();
            }
        } else if in_title {
            if c == '\x07' || c == '\x1b' {
                if title.chars().any(is_braille) {
                    return true;
                }
                in_title = false;
            } else {
                title.push(c);
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use std::time::SystemTime;

    use super::*;

    fn ctx_with_age(plain: &str, secs: u64) -> DetectContext<'_> {
        let now = SystemTime::now();
        let ago = now - Duration::from_secs(secs);
        DetectContext::from_parts(b"", plain, Some(ago), now, None, "s", None, None)
    }

    #[test]
    fn non_codex_is_unknown() {
        assert_eq!(
            CodexDetector.detect(&ctx_with_age("shell output\n$ ls", 60)),
            AgentActivity::Unknown
        );
    }

    #[test]
    fn approve_prompt_is_waiting() {
        assert_eq!(
            CodexDetector.detect(&ctx_with_age("OpenAI Codex\nApprove this command?", 60)),
            AgentActivity::Waiting
        );
    }

    #[test]
    fn activity_verb_is_running() {
        assert_eq!(
            CodexDetector.detect(&ctx_with_age("OpenAI Codex\nExecuting…", 60)),
            AgentActivity::Running
        );
    }

    #[test]
    fn recent_activity_tiebreaks_running() {
        assert_eq!(
            CodexDetector.detect(&ctx_with_age("OpenAI Codex\nsome output", 1)),
            AgentActivity::Running
        );
    }

    #[test]
    fn quiet_codex_is_idle() {
        assert_eq!(
            CodexDetector.detect(&ctx_with_age("OpenAI Codex\nsome output", 60)),
            AgentActivity::Idle
        );
    }
}
