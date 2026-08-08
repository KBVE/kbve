use super::AgentActivity;

pub const STREAK: u8 = 2;

#[derive(Debug, Default, Clone)]
pub struct Smoother {
    current: AgentActivity,
    candidate: AgentActivity,
    streak: u8,
}

impl Smoother {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn observe(&mut self, raw: AgentActivity) -> AgentActivity {
        if self.current == AgentActivity::Unknown {
            self.current = raw;
            self.candidate = raw;
            self.streak = STREAK;
            return self.current;
        }

        if raw == AgentActivity::Unknown {
            return self.current;
        }

        if raw == self.current {
            self.candidate = self.current;
            self.streak = STREAK;
            return self.current;
        }

        if raw == AgentActivity::Running || raw == AgentActivity::Waiting {
            self.current = raw;
            self.candidate = raw;
            self.streak = STREAK;
            return self.current;
        }

        if raw != self.candidate {
            self.candidate = raw;
            self.streak = 1;
        } else {
            self.streak = self.streak.saturating_add(1);
        }

        if self.streak >= STREAK {
            self.current = self.candidate;
        }
        self.current
    }

    pub fn current(&self) -> AgentActivity {
        self.current
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_observation_sticks() {
        let mut s = Smoother::new();
        assert_eq!(s.observe(AgentActivity::Idle), AgentActivity::Idle);
    }

    #[test]
    fn running_to_waiting_is_instant() {
        let mut s = Smoother::new();
        s.observe(AgentActivity::Running);
        assert_eq!(s.observe(AgentActivity::Waiting), AgentActivity::Waiting);
    }

    #[test]
    fn idle_to_running_is_instant() {
        let mut s = Smoother::new();
        s.observe(AgentActivity::Idle);
        assert_eq!(s.observe(AgentActivity::Running), AgentActivity::Running);
    }

    #[test]
    fn running_to_idle_needs_streak() {
        let mut s = Smoother::new();
        s.observe(AgentActivity::Running);
        assert_eq!(s.observe(AgentActivity::Idle), AgentActivity::Running);
        assert_eq!(s.observe(AgentActivity::Idle), AgentActivity::Idle);
    }

    #[test]
    fn idle_flipflop_during_demotion_resets_streak() {
        let mut s = Smoother::new();
        s.observe(AgentActivity::Running);
        assert_eq!(s.observe(AgentActivity::Idle), AgentActivity::Running);
        assert_eq!(s.observe(AgentActivity::Running), AgentActivity::Running);
        assert_eq!(s.observe(AgentActivity::Idle), AgentActivity::Running);
        assert_eq!(s.observe(AgentActivity::Idle), AgentActivity::Idle);
    }

    #[test]
    fn unknown_does_not_disturb_state() {
        let mut s = Smoother::new();
        s.observe(AgentActivity::Running);
        assert_eq!(s.observe(AgentActivity::Unknown), AgentActivity::Running);
        assert_eq!(s.observe(AgentActivity::Unknown), AgentActivity::Running);
    }
}
