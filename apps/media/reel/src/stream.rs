use axum::body::Body;
use axum::http::{StatusCode, header};
use axum::response::Response;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncSeek, AsyncSeekExt};
use tokio_util::io::ReaderStream;

#[derive(Debug, PartialEq, Eq)]
pub struct RangeSpec {
    pub start: u64,
    pub end: u64,
}

/// A Range header the file cannot satisfy, which is always answered with 416.
#[derive(Debug, PartialEq, Eq)]
pub struct RangeNotSatisfiable;

pub fn parse_range(
    header: Option<&str>,
    total: u64,
) -> Result<Option<RangeSpec>, RangeNotSatisfiable> {
    let h = match header {
        Some(h) => h,
        None => return Ok(None),
    };
    let spec = h.strip_prefix("bytes=").ok_or(RangeNotSatisfiable)?;
    let (s, e) = spec.split_once('-').ok_or(RangeNotSatisfiable)?;
    if total == 0 {
        return Err(RangeNotSatisfiable);
    }
    let s = s.trim();
    let e = e.trim();
    if s.is_empty() {
        if e.is_empty() {
            return Err(RangeNotSatisfiable);
        }
        let suffix_len: u64 = e.parse().map_err(|_| RangeNotSatisfiable)?;
        if suffix_len == 0 {
            return Err(RangeNotSatisfiable);
        }
        let start = total.saturating_sub(suffix_len);
        return Ok(Some(RangeSpec {
            start,
            end: total - 1,
        }));
    }
    let start: u64 = s.parse().map_err(|_| RangeNotSatisfiable)?;
    let end: u64 = if e.is_empty() {
        total - 1
    } else {
        e.parse::<u64>()
            .map_err(|_| RangeNotSatisfiable)?
            .min(total - 1)
    };
    if start > end || start > total - 1 {
        return Err(RangeNotSatisfiable);
    }
    Ok(Some(RangeSpec { start, end }))
}

pub fn content_type_for(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    let ext = lower.rsplit('.').next().unwrap_or("");
    match ext {
        "mp4" | "m4v" => "video/mp4",
        "mkv" => "video/x-matroska",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "ts" | "m2ts" | "mts" => "video/mp2t",
        "mpg" | "mpeg" => "video/mpeg",
        "wmv" => "video/x-ms-wmv",
        "flv" => "video/x-flv",
        "ogv" => "video/ogg",
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "m4a" | "m4b" => "audio/mp4",
        "aac" => "audio/aac",
        "ogg" | "oga" => "audio/ogg",
        "opus" => "audio/opus",
        "wma" => "audio/x-ms-wma",
        "aiff" | "aif" => "audio/aiff",
        "ape" => "audio/x-ape",
        "wv" => "audio/x-wavpack",
        "dsf" | "dff" => "audio/x-dsd",
        "mid" | "midi" => "audio/midi",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "tif" | "tiff" => "image/tiff",
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        "rar" => "application/vnd.rar",
        "7z" => "application/x-7z-compressed",
        "epub" => "application/epub+zip",
        "cue" | "log" | "nfo" | "txt" | "md" => "text/plain; charset=utf-8",
        "srt" => "application/x-subrip",
        "vtt" => "text/vtt; charset=utf-8",
        "ass" | "ssa" => "text/x-ssa; charset=utf-8",
        "json" => "application/json",
        "m3u" | "m3u8" => "application/vnd.apple.mpegurl",
        _ => "application/octet-stream",
    }
}

pub async fn serve_range<R>(
    mut reader: R,
    total: u64,
    range: Option<&str>,
    content_type: &str,
    head_only: bool,
) -> Response
where
    R: AsyncRead + AsyncSeek + Send + Unpin + 'static,
{
    let spec = match parse_range(range, total) {
        Ok(s) => s,
        Err(RangeNotSatisfiable) => {
            return Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::ACCEPT_RANGES, "bytes")
                .header(header::CONTENT_RANGE, format!("bytes */{total}"))
                .body(Body::empty())
                .unwrap();
        }
    };

    match spec {
        None => {
            let body = if head_only {
                Body::empty()
            } else {
                Body::from_stream(ReaderStream::new(reader))
            };
            Response::builder()
                .status(StatusCode::OK)
                .header(header::ACCEPT_RANGES, "bytes")
                .header(header::CONTENT_LENGTH, total)
                .header(header::CONTENT_TYPE, content_type)
                .body(body)
                .unwrap()
        }
        Some(RangeSpec { start, end }) => {
            let len = end - start + 1;
            let body = if head_only {
                Body::empty()
            } else {
                if reader.seek(std::io::SeekFrom::Start(start)).await.is_err() {
                    return Response::builder()
                        .status(StatusCode::INTERNAL_SERVER_ERROR)
                        .header(header::ACCEPT_RANGES, "bytes")
                        .body(Body::empty())
                        .unwrap();
                }
                Body::from_stream(ReaderStream::new(reader.take(len)))
            };
            Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::ACCEPT_RANGES, "bytes")
                .header(
                    header::CONTENT_RANGE,
                    format!("bytes {start}-{end}/{total}"),
                )
                .header(header::CONTENT_LENGTH, len)
                .header(header::CONTENT_TYPE, content_type)
                .body(body)
                .unwrap()
        }
    }
}

pub fn head_response(total: u64, range: Option<&str>, content_type: &str) -> Response {
    let spec = match parse_range(range, total) {
        Ok(s) => s,
        Err(RangeNotSatisfiable) => {
            return Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::ACCEPT_RANGES, "bytes")
                .header(header::CONTENT_RANGE, format!("bytes */{total}"))
                .body(Body::empty())
                .unwrap();
        }
    };

    match spec {
        None => Response::builder()
            .status(StatusCode::OK)
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::CONTENT_LENGTH, total)
            .header(header::CONTENT_TYPE, content_type)
            .body(Body::empty())
            .unwrap(),
        Some(RangeSpec { start, end }) => {
            let len = end - start + 1;
            Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::ACCEPT_RANGES, "bytes")
                .header(
                    header::CONTENT_RANGE,
                    format!("bytes {start}-{end}/{total}"),
                )
                .header(header::CONTENT_LENGTH, len)
                .header(header::CONTENT_TYPE, content_type)
                .body(Body::empty())
                .unwrap()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_header_is_full() {
        assert_eq!(parse_range(None, 100), Ok(None));
    }
    #[test]
    fn closed_range() {
        assert_eq!(
            parse_range(Some("bytes=0-9"), 100),
            Ok(Some(RangeSpec { start: 0, end: 9 }))
        );
    }
    #[test]
    fn open_ended_range() {
        assert_eq!(
            parse_range(Some("bytes=90-"), 100),
            Ok(Some(RangeSpec { start: 90, end: 99 }))
        );
    }
    #[test]
    fn end_clamped_to_total() {
        assert_eq!(
            parse_range(Some("bytes=0-999"), 100),
            Ok(Some(RangeSpec { start: 0, end: 99 }))
        );
    }
    #[test]
    fn start_past_end_is_416() {
        assert_eq!(
            parse_range(Some("bytes=100-"), 100),
            Err(RangeNotSatisfiable)
        );
    }
    #[test]
    fn suffix_range_larger_than_total() {
        assert_eq!(
            parse_range(Some("bytes=-500"), 100),
            Ok(Some(RangeSpec { start: 0, end: 99 }))
        );
    }
    #[test]
    fn suffix_range_within_total() {
        assert_eq!(
            parse_range(Some("bytes=-50"), 100),
            Ok(Some(RangeSpec { start: 50, end: 99 }))
        );
    }
    #[test]
    fn suffix_range_zero_is_416() {
        assert_eq!(parse_range(Some("bytes=-0"), 100), Err(RangeNotSatisfiable));
    }
    #[test]
    fn empty_range_is_416() {
        assert_eq!(parse_range(Some("bytes=-"), 100), Err(RangeNotSatisfiable));
    }
    #[test]
    fn content_types() {
        assert_eq!(content_type_for("a.mp4"), "video/mp4");
        assert_eq!(content_type_for("a.mkv"), "video/x-matroska");
        assert_eq!(content_type_for("a.unknown"), "application/octet-stream");
    }

    #[test]
    fn audio_content_types() {
        assert_eq!(content_type_for("01 - track.FLAC"), "audio/flac");
        assert_eq!(content_type_for("a.wav"), "audio/wav");
        assert_eq!(content_type_for("a.ogg"), "audio/ogg");
        assert_eq!(content_type_for("a.opus"), "audio/opus");
        assert_eq!(content_type_for("a.m4a"), "audio/mp4");
    }

    #[test]
    fn matches_on_the_last_extension_only() {
        assert_eq!(
            content_type_for("mix.flac.part"),
            "application/octet-stream",
            "a partial download is not a playable flac"
        );
        assert_eq!(content_type_for("art/cover.jpg"), "image/jpeg");
        assert_eq!(content_type_for("noext"), "application/octet-stream");
    }

    #[tokio::test]
    async fn serve_range_206_has_content_range() {
        use axum::http::StatusCode;
        let data = std::io::Cursor::new((0u8..100).collect::<Vec<u8>>());
        let resp = serve_range(data, 100, Some("bytes=10-19"), "video/mp4", false).await;
        assert_eq!(resp.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            resp.headers().get("content-range").unwrap(),
            "bytes 10-19/100"
        );
        assert_eq!(resp.headers().get("content-length").unwrap(), "10");
    }

    #[tokio::test]
    async fn serve_range_full_is_200() {
        use axum::http::StatusCode;
        let data = std::io::Cursor::new(vec![0u8; 50]);
        let resp = serve_range(data, 50, None, "video/mp4", false).await;
        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(resp.headers().get("accept-ranges").unwrap(), "bytes");
    }

    #[tokio::test]
    async fn serve_range_416_has_accept_ranges() {
        use axum::http::StatusCode;
        let data = std::io::Cursor::new(vec![0u8; 100]);
        let resp = serve_range(data, 100, Some("bytes=100-"), "video/mp4", false).await;
        assert_eq!(resp.status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert_eq!(resp.headers().get("accept-ranges").unwrap(), "bytes");
    }

    #[test]
    fn head_response_206_has_content_range_and_empty_body() {
        use axum::http::StatusCode;
        let resp = head_response(100, Some("bytes=10-19"), "video/mp4");
        assert_eq!(resp.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            resp.headers().get("content-range").unwrap(),
            "bytes 10-19/100"
        );
        assert_eq!(resp.headers().get("content-length").unwrap(), "10");
    }

    #[test]
    fn head_response_full_is_200() {
        use axum::http::StatusCode;
        let resp = head_response(50, None, "video/mp4");
        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(resp.headers().get("content-length").unwrap(), "50");
    }

    #[test]
    fn head_response_416() {
        use axum::http::StatusCode;
        let resp = head_response(100, Some("bytes=100-"), "video/mp4");
        assert_eq!(resp.status(), StatusCode::RANGE_NOT_SATISFIABLE);
    }
}
