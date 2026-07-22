use axum::body::Body;
use axum::http::{header, StatusCode};
use axum::response::Response;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncSeek, AsyncSeekExt};
use tokio_util::io::ReaderStream;

#[derive(Debug, PartialEq, Eq)]
pub struct RangeSpec {
    pub start: u64,
    pub end: u64,
}

pub fn parse_range(header: Option<&str>, total: u64) -> Result<Option<RangeSpec>, ()> {
    let h = match header {
        Some(h) => h,
        None => return Ok(None),
    };
    let spec = h.strip_prefix("bytes=").ok_or(())?;
    let (s, e) = spec.split_once('-').ok_or(())?;
    if total == 0 {
        return Err(());
    }
    let start: u64 = s.trim().parse().map_err(|_| ())?;
    let end: u64 = if e.trim().is_empty() {
        total - 1
    } else {
        e.trim().parse::<u64>().map_err(|_| ())?.min(total - 1)
    };
    if start > end || start > total - 1 {
        return Err(());
    }
    Ok(Some(RangeSpec { start, end }))
}

pub fn content_type_for(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".mp4") || lower.ends_with(".m4v") {
        "video/mp4"
    } else if lower.ends_with(".mkv") {
        "video/x-matroska"
    } else if lower.ends_with(".webm") {
        "video/webm"
    } else if lower.ends_with(".mov") {
        "video/quicktime"
    } else if lower.ends_with(".avi") {
        "video/x-msvideo"
    } else if lower.ends_with(".ts") {
        "video/mp2t"
    } else {
        "application/octet-stream"
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
        Err(()) => {
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
                .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{total}"))
                .header(header::CONTENT_LENGTH, len)
                .header(header::CONTENT_TYPE, content_type)
                .body(body)
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
        assert_eq!(parse_range(Some("bytes=0-9"), 100), Ok(Some(RangeSpec { start: 0, end: 9 })));
    }
    #[test]
    fn open_ended_range() {
        assert_eq!(parse_range(Some("bytes=90-"), 100), Ok(Some(RangeSpec { start: 90, end: 99 })));
    }
    #[test]
    fn end_clamped_to_total() {
        assert_eq!(parse_range(Some("bytes=0-999"), 100), Ok(Some(RangeSpec { start: 0, end: 99 })));
    }
    #[test]
    fn start_past_end_is_416() {
        assert_eq!(parse_range(Some("bytes=100-"), 100), Err(()));
    }
    #[test]
    fn content_types() {
        assert_eq!(content_type_for("a.mp4"), "video/mp4");
        assert_eq!(content_type_for("a.mkv"), "video/x-matroska");
        assert_eq!(content_type_for("a.unknown"), "application/octet-stream");
    }

    #[tokio::test]
    async fn serve_range_206_has_content_range() {
        use axum::http::StatusCode;
        let data = std::io::Cursor::new((0u8..100).collect::<Vec<u8>>());
        let resp = serve_range(data, 100, Some("bytes=10-19"), "video/mp4", false).await;
        assert_eq!(resp.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(resp.headers().get("content-range").unwrap(), "bytes 10-19/100");
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
}
