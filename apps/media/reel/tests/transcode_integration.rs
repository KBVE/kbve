use std::path::Path;

fn moov_before_mdat(path: &Path) -> bool {
    let bytes = std::fs::read(path).unwrap();
    let find = |needle: &[u8]| bytes.windows(4).position(|w| w == needle);
    match (find(b"moov"), find(b"mdat")) {
        (Some(m), Some(d)) => m < d,
        _ => false,
    }
}

#[tokio::test]
#[ignore = "requires ffmpeg/ffprobe"]
async fn remux_and_encode_produce_faststart_mp4() {
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("src.mp4");
    let status = std::process::Command::new("ffmpeg")
        .args(["-y", "-f", "lavfi", "-i", "testsrc=duration=1:size=128x128:rate=15",
               "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
               "-c:v", "libx264", "-c:a", "aac", "-shortest"])
        .arg(&src)
        .status()
        .unwrap();
    assert!(status.success());

    let probe = reel::transcode::probe("ffprobe", &src).await.unwrap();
    assert_eq!(reel::transcode::decide_route(&probe), reel::transcode::Route::Remux);

    let remuxed = dir.path().join("out.remux.mp4");
    reel::transcode::remux("ffmpeg", &src, &remuxed).await.unwrap();
    assert!(remuxed.exists() && std::fs::metadata(&remuxed).unwrap().len() > 0);
    assert!(moov_before_mdat(&remuxed));

    let encoded = dir.path().join("out.encode.mp4");
    reel::transcode::encode("ffmpeg", &src, &encoded).await.unwrap();
    assert!(encoded.exists() && std::fs::metadata(&encoded).unwrap().len() > 0);
    assert!(moov_before_mdat(&encoded));
}
