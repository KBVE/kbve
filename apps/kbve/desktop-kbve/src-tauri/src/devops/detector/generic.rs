use std::time::Duration;

use super::{AgentActivity, DetectContext, StatusDetector};

pub struct GenericDetector;

impl StatusDetector for GenericDetector {
    fn name(&self) -> &'static str {
        "generic"
    }

    fn priority(&self) -> u8 {
        10
    }

    fn detect(&self, ctx: &DetectContext<'_>) -> AgentActivity {
        if ctx.activity_age < Duration::from_secs(2) {
            AgentActivity::Running
        } else if ctx.activity_age < Duration::from_secs(30) {
            AgentActivity::Waiting
        } else {
            AgentActivity::Idle
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::SystemTime;

    use super::*;

    fn ctx_with_age(secs: u64) -> DetectContext<'static> {
        let now = SystemTime::now();
        let ago = now - Duration::from_secs(secs);
        DetectContext::from_parts(b"", "", Some(ago), now, None, "s", None, None)
    }

    #[test]
    fn recent_activity_is_running() {
        assert_eq!(
            GenericDetector.detect(&ctx_with_age(0)),
            AgentActivity::Running
        );
        assert_eq!(
            GenericDetector.detect(&ctx_with_age(1)),
            AgentActivity::Running
        );
    }

    #[test]
    fn mid_range_is_waiting() {
        assert_eq!(
            GenericDetector.detect(&ctx_with_age(5)),
            AgentActivity::Waiting
        );
        assert_eq!(
            GenericDetector.detect(&ctx_with_age(20)),
            AgentActivity::Waiting
        );
    }

    #[test]
    fn old_activity_is_idle() {
        assert_eq!(
            GenericDetector.detect(&ctx_with_age(60)),
            AgentActivity::Idle
        );
        assert_eq!(
            GenericDetector.detect(&ctx_with_age(3600)),
            AgentActivity::Idle
        );
    }
}
