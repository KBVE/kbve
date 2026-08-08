use super::{
    bottom_region, is_braille, title_is_working, AgentActivity, DetectContext, StatusDetector,
};

pub struct ClaudeDetector;

impl StatusDetector for ClaudeDetector {
    fn name(&self) -> &'static str {
        "claude"
    }

    fn priority(&self) -> u8 {
        100
    }

    fn detect(&self, ctx: &DetectContext<'_>) -> AgentActivity {
        let bottom = bottom_region(ctx.plain);

        if !looks_like_claude(ctx.plain, &bottom, ctx.pane_command) {
            return AgentActivity::Unknown;
        }

        if has_prompt_marker(&bottom) {
            return AgentActivity::Waiting;
        }

        if ctx.pane_title.is_some_and(title_is_working)
            || has_thinking_marker(&bottom)
            || has_spinner_title(ctx.ansi)
        {
            return AgentActivity::Running;
        }

        AgentActivity::Idle
    }
}

fn looks_like_claude(plain: &str, bottom: &str, pane_command: Option<&str>) -> bool {
    if pane_command.is_some_and(is_claude_version_command) {
        return true;
    }
    if bottom.contains('╭') && bottom.contains('╰') {
        return true;
    }
    plain.contains("? for shortcuts")
        || plain.contains("▐▛███▜▌")
        || plain.contains("Claude Code")
}

fn is_claude_version_command(cmd: &str) -> bool {
    cmd.starts_with(|c: char| c.is_ascii_digit())
        && cmd.contains('_')
        && cmd.chars().all(|c| c.is_ascii_digit() || c == '_')
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
    ];
    if PROMPTS.iter().any(|p| region.contains(p)) {
        return true;
    }
    region.lines().any(|l| match l.find('❯') {
        Some(i) => l[i + '❯'.len_utf8()..]
            .trim_start()
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_digit()),
        None => false,
    })
}

fn has_thinking_marker(region: &str) -> bool {
    const VERBS: &[&str] = &[
        "Thinking",
        "Pondering",
        "Reviewing",
        "Synthesizing",
        "Computing",
        "Formulating",
        "Contemplating",
        "Analyzing",
        "Reasoning",
        "Crafting",
        "Considering",
        "Working",
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

    fn ctx<'a>(plain: &'a str) -> DetectContext<'a> {
        let now = SystemTime::now();
        DetectContext::from_parts(b"", plain, Some(now), now, None, "s", None, None)
    }

    fn ctx_with_title<'a>(plain: &'a str, title: &'a str) -> DetectContext<'a> {
        let now = SystemTime::now();
        DetectContext::from_parts(b"", plain, Some(now), now, None, "s", Some(title), None)
    }

    fn ctx_with_command<'a>(plain: &'a str, cmd: &'a str) -> DetectContext<'a> {
        let now = SystemTime::now();
        DetectContext::from_parts(b"", plain, Some(now), now, None, "s", None, Some(cmd))
    }

    const PROMPT_BOX: &str = "╭──────╮\n│ >    │\n╰──────╯\n? for shortcuts";

    #[test]
    fn non_claude_pane_is_unknown() {
        assert_eq!(
            ClaudeDetector.detect(&ctx("just a shell\n$ ls\nfile.txt")),
            AgentActivity::Unknown
        );
    }

    #[test]
    fn version_shaped_pane_command_anchors() {
        assert_eq!(
            ClaudeDetector.detect(&ctx_with_command("full screen diff view", "2_1_220")),
            AgentActivity::Idle
        );
    }

    #[test]
    fn version_command_shape_is_strict() {
        for cmd in ["zsh", "node", "7zip", "bash5_2", "2.1.220"] {
            assert!(!is_claude_version_command(cmd), "{cmd}");
        }
        assert!(is_claude_version_command("2_1_220"));
    }

    #[test]
    fn idle_prompt_box_is_idle_not_waiting() {
        assert_eq!(ClaudeDetector.detect(&ctx(PROMPT_BOX)), AgentActivity::Idle);
    }

    #[test]
    fn numbered_menu_arrow_is_waiting() {
        let plain = format!("Do you want to proceed?\n❯ 1. Yes\n  2. No\n{}", PROMPT_BOX);
        assert_eq!(ClaudeDetector.detect(&ctx(&plain)), AgentActivity::Waiting);
    }

    #[test]
    fn composer_arrow_with_typed_text_is_not_waiting() {
        let plain = "╭──────╮\n│ ❯ Fix the parser bug │\n╰──────╯\n? for shortcuts";
        assert_eq!(ClaudeDetector.detect(&ctx(plain)), AgentActivity::Idle);
    }

    #[test]
    fn thinking_in_bottom_region_is_running() {
        let plain = format!("Thinking…\n{}", PROMPT_BOX);
        assert_eq!(ClaudeDetector.detect(&ctx(&plain)), AgentActivity::Running);
    }

    #[test]
    fn stale_thinking_in_scrollback_does_not_trigger_running() {
        let filler = "output line\n".repeat(20);
        let plain = format!("Thinking…\n{}{}", filler, PROMPT_BOX);
        assert_eq!(ClaudeDetector.detect(&ctx(&plain)), AgentActivity::Idle);
    }

    #[test]
    fn braille_pane_title_is_running() {
        assert_eq!(
            ClaudeDetector.detect(&ctx_with_title(PROMPT_BOX, "⠙ Fix the parser bug")),
            AgentActivity::Running
        );
    }

    #[test]
    fn star_pane_title_is_not_running() {
        assert_eq!(
            ClaudeDetector.detect(&ctx_with_title(PROMPT_BOX, "✳ Fix the parser bug")),
            AgentActivity::Idle
        );
    }

    #[test]
    fn yn_prompt_is_waiting() {
        let plain = format!("Overwrite file? (y/n)\n{}", PROMPT_BOX);
        assert_eq!(ClaudeDetector.detect(&ctx(&plain)), AgentActivity::Waiting);
    }

    #[test]
    fn spinner_in_raw_osc_title_is_running() {
        let ansi = b"\x1b]0;\xe2\xa0\x99 task\x07\xe2\x95\xad box \xe2\x95\xb0";
        let now = SystemTime::now();
        let plain = strip_test(ansi);
        let ctx =
            DetectContext::from_parts(ansi, &plain, Some(now), now, None, "s", None, None);
        assert_eq!(ClaudeDetector.detect(&ctx), AgentActivity::Running);
    }

    fn strip_test(ansi: &[u8]) -> String {
        super::super::strip_ansi(ansi)
    }
}
