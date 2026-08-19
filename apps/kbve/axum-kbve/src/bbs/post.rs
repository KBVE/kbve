use crate::db::get_kv_cache;

pub const MAX_TITLE_LEN: usize = 180;
pub const MAX_POST_LEN: usize = 6000;
pub const MAX_LINE_LEN: usize = 240;
pub const THREAD_TYPE: &str = "discussion";

const RATE_WINDOW_SECS: u64 = 60;
const RATE_MAX_PER_WINDOW: u64 = 4;

/// Titles land in a single-line list cell and in the RPC's own length check,
/// so they lose their control bytes here rather than at the far end.
pub fn sanitize_title(input: &str) -> String {
    let cleaned: String = input
        .chars()
        .map(|c| {
            if c.is_ascii_graphic() || c == ' ' {
                c
            } else {
                ' '
            }
        })
        .collect();
    let trimmed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    match trimmed.char_indices().nth(MAX_TITLE_LEN) {
        Some((idx, _)) => trimmed[..idx].to_string(),
        None => trimmed,
    }
}

/// Bodies keep their line breaks — a post is prose, not a chat line — but
/// nothing else outside printable ASCII survives the trip from a terminal.
pub fn sanitize_body(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.replace("\r\n", "\n").chars() {
        match ch {
            '\n' => out.push('\n'),
            '\t' => out.push(' '),
            c if c.is_ascii_graphic() || c == ' ' => out.push(c),
            _ => {}
        }
    }
    let trimmed = out.trim();
    match trimmed.char_indices().nth(MAX_POST_LEN) {
        Some((idx, _)) => trimmed[..idx].to_string(),
        None => trimmed.to_string(),
    }
}

/// Fixed-window limiter shared with the rest of the fleet through Valkey.
/// Fails closed like chat: a post leaves the process for a table everyone
/// reads, so a missing counter must not read as headroom.
pub async fn throttled(user_id: &str) -> bool {
    let Some(cache) = get_kv_cache() else {
        return false;
    };
    match cache
        .check_rate(&format!("bbs:post:{user_id}"), RATE_WINDOW_SECS)
        .await
    {
        Some(hits) => hits > RATE_MAX_PER_WINDOW,
        None => true,
    }
}
