//! Centralized color palette for all Bevy UI elements.
//!
//! Every in-game UI (title screen, HUD, pause menu, settings) should pull
//! colors from here so the visual language stays consistent.

use bevy::prelude::*;

// ---------------------------------------------------------------------------
// Background / Panel
// ---------------------------------------------------------------------------

/// Full-screen overlay backdrop (semi-transparent dark).
pub const BACKDROP: Color = Color::srgba(0.03, 0.03, 0.06, 0.85);

/// Panel / card surface.
pub const PANEL: Color = Color::srgba(0.08, 0.09, 0.12, 0.92);

/// Panel border or subtle separator.
pub const PANEL_BORDER: Color = Color::srgba(0.25, 0.28, 0.35, 0.5);

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/// Primary text (headings, important labels).
pub const TEXT_PRIMARY: Color = Color::srgba(0.92, 0.94, 0.96, 1.0);

/// Secondary / muted text (descriptions, hints).
pub const TEXT_SECONDARY: Color = Color::srgba(0.6, 0.63, 0.68, 1.0);

/// Accent text (status highlights, links).
pub const TEXT_ACCENT: Color = Color::srgba(0.3, 0.7, 1.0, 1.0);

/// Success text.
pub const TEXT_SUCCESS: Color = Color::srgba(0.3, 0.85, 0.45, 1.0);

/// Warning / caution text.
pub const TEXT_WARNING: Color = Color::srgba(0.95, 0.75, 0.2, 1.0);

/// Error text.
pub const TEXT_ERROR: Color = Color::srgba(0.95, 0.3, 0.3, 1.0);

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/// Primary button background (call-to-action).
pub const BTN_PRIMARY: Color = Color::srgba(0.2, 0.55, 0.95, 1.0);

/// Primary button hovered.
pub const BTN_PRIMARY_HOVER: Color = Color::srgba(0.25, 0.6, 1.0, 1.0);

/// Primary button pressed.
pub const BTN_PRIMARY_PRESSED: Color = Color::srgba(0.15, 0.45, 0.8, 1.0);

/// Secondary / outline button background.
pub const BTN_SECONDARY: Color = Color::srgba(0.15, 0.16, 0.2, 0.8);

/// Secondary button hovered.
pub const BTN_SECONDARY_HOVER: Color = Color::srgba(0.2, 0.22, 0.28, 0.9);

/// Secondary button pressed.
pub const BTN_SECONDARY_PRESSED: Color = Color::srgba(0.12, 0.13, 0.16, 0.9);

/// Button text color.
pub const BTN_TEXT: Color = Color::srgba(0.92, 0.94, 0.96, 1.0);

// ---------------------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------------------

/// WebTransport badge.
pub const BADGE_WT: Color = Color::srgba(0.3, 0.85, 0.45, 0.9);

/// WebSocket badge.
pub const BADGE_WS: Color = Color::srgba(0.3, 0.7, 1.0, 0.9);

/// Offline / disconnected badge.
pub const BADGE_OFFLINE: Color = Color::srgba(0.5, 0.5, 0.55, 0.8);

/// Loading / in-progress badge.
pub const BADGE_LOADING: Color = Color::srgba(0.95, 0.75, 0.2, 0.9);

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/// Divider / horizontal rule.
pub const DIVIDER: Color = Color::srgba(0.25, 0.28, 0.35, 0.4);

/// Progress bar fill.
pub const PROGRESS_FILL: Color = Color::srgba(0.3, 0.7, 1.0, 0.9);

/// Progress bar track (unfilled).
pub const PROGRESS_TRACK: Color = Color::srgba(0.12, 0.13, 0.16, 0.6);
