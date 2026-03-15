/// XP curve defining how much XP is needed per level.
///
/// The default curve uses a quadratic formula:
/// `xp_for_level(n) = base + (n * n * scaling)`
///
/// This produces a gentle early game and a steep late game.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct XpCurve {
    /// Base XP required for level 1.
    pub base: u64,
    /// Quadratic scaling factor.
    pub scaling: u64,
    /// Maximum level a skill can reach.
    pub max_level: u32,
}

impl Default for XpCurve {
    fn default() -> Self {
        Self {
            base: 50,
            scaling: 25,
            max_level: 99,
        }
    }
}

impl XpCurve {
    /// Total XP required to reach a given level (cumulative).
    pub fn xp_for_level(&self, level: u32) -> u64 {
        if level == 0 {
            return 0;
        }
        let n = level as u64;
        self.base * n + self.scaling * n * n
    }

    /// Calculate the level for a given total XP amount.
    pub fn level_for_xp(&self, total_xp: u64) -> u32 {
        let mut level = 0u32;
        while level < self.max_level && self.xp_for_level(level + 1) <= total_xp {
            level += 1;
        }
        level
    }

    /// XP remaining until the next level.
    pub fn xp_to_next_level(&self, total_xp: u64) -> u64 {
        let current = self.level_for_xp(total_xp);
        if current >= self.max_level {
            return 0;
        }
        self.xp_for_level(current + 1).saturating_sub(total_xp)
    }

    /// Progress fraction (0.0 to 1.0) through the current level.
    pub fn progress(&self, total_xp: u64) -> f32 {
        let current = self.level_for_xp(total_xp);
        if current >= self.max_level {
            return 1.0;
        }
        let floor = self.xp_for_level(current);
        let ceiling = self.xp_for_level(current + 1);
        let range = ceiling - floor;
        if range == 0 {
            return 1.0;
        }
        (total_xp - floor) as f32 / range as f32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_curve_basics() {
        let curve = XpCurve::default();
        assert_eq!(curve.xp_for_level(0), 0);
        assert_eq!(curve.xp_for_level(1), 75); // 50 + 25
        assert_eq!(curve.level_for_xp(0), 0);
        assert_eq!(curve.level_for_xp(75), 1);
        assert_eq!(curve.level_for_xp(74), 0);
    }

    #[test]
    fn level_caps_at_max() {
        let curve = XpCurve {
            max_level: 5,
            ..Default::default()
        };
        assert_eq!(curve.level_for_xp(u64::MAX), 5);
        assert_eq!(curve.xp_to_next_level(u64::MAX), 0);
    }

    #[test]
    fn progress_fraction() {
        let curve = XpCurve::default();
        assert_eq!(curve.progress(0), 0.0);
        let halfway = curve.xp_for_level(1) / 2;
        let p = curve.progress(halfway);
        assert!(p > 0.0 && p < 1.0);
    }
}
