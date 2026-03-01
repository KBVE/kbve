/// Bot lifecycle states with associated display properties.
///
/// Ported from notification-bot's `StatusState` enum, simplified
/// to the five states relevant for the Rust bot.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum StatusState {
    Online,
    Offline,
    Starting,
    Stopping,
    Error,
}

impl StatusState {
    /// Embed sidebar color as a Discord color integer.
    pub fn color(self) -> u32 {
        match self {
            Self::Online => 0x57F287,
            Self::Offline => 0xED4245,
            Self::Starting => 0xFEE75C,
            Self::Stopping => 0xE67E22,
            Self::Error => 0x992D22,
        }
    }

    /// Unicode emoji for inline display.
    pub fn emoji(self) -> &'static str {
        match self {
            Self::Online => "\u{1F7E2}",
            Self::Offline => "\u{1F534}",
            Self::Starting => "\u{1F7E1}",
            Self::Stopping => "\u{1F7E0}",
            Self::Error => "\u{26A0}\u{FE0F}",
        }
    }

    /// Human-readable label.
    pub fn label(self) -> &'static str {
        match self {
            Self::Online => "Online & Ready",
            Self::Offline => "Offline",
            Self::Starting => "Starting...",
            Self::Stopping => "Stopping...",
            Self::Error => "Error",
        }
    }

    /// Thumbnail URL for the status embed.
    pub fn thumbnail_url(self) -> &'static str {
        match self {
            Self::Online => "https://octodex.github.com/images/megacat-2.png",
            Self::Offline => "https://octodex.github.com/images/deckfailcat.png",
            Self::Starting => "https://octodex.github.com/images/dunetocat.png",
            Self::Stopping => "https://octodex.github.com/images/dunetocat.png",
            Self::Error => "https://octodex.github.com/images/dunetocat.png",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn online_color_is_green() {
        assert_eq!(StatusState::Online.color(), 0x57F287);
    }

    #[test]
    fn all_variants_have_nonempty_properties() {
        for state in [
            StatusState::Online,
            StatusState::Offline,
            StatusState::Starting,
            StatusState::Stopping,
            StatusState::Error,
        ] {
            assert!(!state.label().is_empty());
            assert!(!state.emoji().is_empty());
            assert!(!state.thumbnail_url().is_empty());
        }
    }
}
