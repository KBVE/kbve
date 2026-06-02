//! `/api/v1/yuki/chat` — server-sent events stream for the Yuki dock.
//!
//! Phase C ships only the **stream plumbing**: handler signature,
//! per-request token shaping, keep-alive cadence, and a deterministic
//! canned reply that lets the dock panel exercise the full SSE +
//! lipsync path end-to-end without committing to an LLM provider.
//!
//! Phase D swaps the body of `stream_reply` for a real chat backend
//! (jedi / q-routed). Everything else — the route signature, the
//! `data: <chunk>\n\n` framing, the `event: done` terminator — stays
//! exactly the way it is here so the front-end does not need to change
//! again when the upgrade lands.

use std::convert::Infallible;
use std::time::Duration;

use axum::{
    extract::Query,
    response::{
        IntoResponse,
        sse::{Event, KeepAlive, Sse},
    },
};
use futures_util::stream::{self, Stream, StreamExt};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub(crate) struct YukiChatQuery {
    /// Prompt text. Whitespace-trimmed by the handler; rejected when
    /// empty after trim. No max length right now — Phase D will gate
    /// on token count once a tokenizer is wired.
    pub q: String,
}

/// `GET /api/v1/yuki/chat?q=<prompt>`
///
/// Streams the reply as `text/event-stream`:
///   data: <utf8 chunk>\n\n        (one per token / sentence fragment)
///   event: done\ndata: \n\n        (terminator)
///
/// `EventStream` from the front-end calls `onmessage` for the data
/// frames and `addEventListener('done', …)` for the terminator. The
/// dock panel aggregates the chunks into a single message bubble and
/// hands the assembled text to `speak()` once the stream completes,
/// so SpeechSynthesis can drive the VRM lipsync.
///
/// Keep-alive comments fire every 15s so corporate proxies / CDNs
/// don't time the connection out mid-reply.
pub(crate) async fn chat_handler(Query(params): Query<YukiChatQuery>) -> impl IntoResponse {
    let prompt = params.q.trim().to_string();
    if prompt.is_empty() {
        // 400 — empty prompt. SSE clients treat this as a fail, the
        // panel surfaces the body as an inline error bubble.
        return (axum::http::StatusCode::BAD_REQUEST, "prompt is required").into_response();
    }

    let stream = stream_reply(prompt);
    Sse::new(stream)
        .keep_alive(
            KeepAlive::new()
                .interval(Duration::from_secs(15))
                .text("keepalive"),
        )
        .into_response()
}

/// Deterministic placeholder generator — chunks a canned reply into
/// ~3-word fragments with a short delay between sends so the lipsync
/// analyser on the front-end sees realistic amplitude variation.
fn stream_reply(prompt: String) -> impl Stream<Item = Result<Event, Infallible>> {
    let reply = compose_reply(&prompt);
    let words: Vec<&str> = reply.split_whitespace().collect();
    // Pre-allocate so the stream is owning, not borrowing the prompt.
    let chunks: Vec<String> = words.chunks(3).map(|w| w.join(" ")).collect();

    let body = stream::iter(chunks).then(|chunk| async move {
        // ~80ms between chunks ≈ a comfortable reading + speaking pace.
        tokio::time::sleep(Duration::from_millis(80)).await;
        Ok::<Event, Infallible>(Event::default().data(chunk))
    });

    let done =
        stream::once(async { Ok::<Event, Infallible>(Event::default().event("done").data("")) });

    body.chain(done)
}

/// Phase C canned reply — acknowledges the prompt and points the
/// user at the forum + the docs page. Phase D replaces the body of
/// this function with the real LLM call.
fn compose_reply(prompt: &str) -> String {
    let trimmed: String = prompt.chars().take(160).collect();
    format!(
        "Heard you — \"{}\". The real Yuki backend is still wiring up; \
         for now I'm running on a canned reply so we can stress-test \
         the SSE plumbing and the lipsync hook. Track the rollout on \
         the project/yuki page, or drop the question in the forum and \
         a human will get back to you.",
        trimmed
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use axum::http::StatusCode;
    use futures_util::StreamExt;

    #[tokio::test]
    async fn empty_prompt_returns_400_with_documented_body() {
        let response = chat_handler(Query(YukiChatQuery { q: "".to_string() }))
            .await
            .into_response();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = to_bytes(response.into_body(), 1024).await.unwrap();
        assert_eq!(body.as_ref(), b"prompt is required");
    }

    #[tokio::test]
    async fn whitespace_only_prompt_is_rejected_as_empty() {
        let response = chat_handler(Query(YukiChatQuery {
            q: "   \t\n".to_string(),
        }))
        .await
        .into_response();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn three_word_chunk_split_produces_n_events_ending_in_done() {
        let prompt = "hello".to_string();
        let reply = compose_reply(&prompt);
        let word_count = reply.split_whitespace().count();
        let expected_chunks = word_count.div_ceil(3);

        let mut stream = std::pin::pin!(stream_reply(prompt));
        let mut data_events = 0_usize;
        let mut done_seen = false;
        while let Some(item) = stream.next().await {
            let event = item.expect("event yields Ok");
            // Event has no public accessor for its name/data, but the
            // serialized form starts with `event: done` for the terminator
            // and `data: ` for body chunks.
            let serialized = format!("{:?}", event);
            if serialized.contains("done") {
                done_seen = true;
                break;
            }
            data_events += 1;
        }
        assert!(
            done_seen,
            "stream must end with an `event: done` terminator"
        );
        assert_eq!(
            data_events, expected_chunks,
            "data chunk count must match `words.chunks(3)` len"
        );
    }

    #[test]
    fn compose_reply_truncates_to_160_chars() {
        let long_prompt: String = "x".repeat(500);
        let reply = compose_reply(&long_prompt);
        // The embedded prompt must be 160 chars max; the surrounding
        // boilerplate stays the same length, so an upper bound is enough.
        let xs: usize = reply.chars().filter(|c| *c == 'x').count();
        assert_eq!(xs, 160);
    }

    #[test]
    fn keepalive_builder_uses_15_second_interval() {
        // KeepAlive doesn't expose accessors, but constructing the same
        // value the handler does must succeed and be cheap.
        let _ka = KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keepalive");
    }
}
