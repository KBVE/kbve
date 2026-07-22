#[tokio::test]
#[ignore = "requires ffmpeg"]
async fn hls_transcode_integration() {
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("clip.mkv");

    let status = std::process::Command::new("ffmpeg")
        .args([
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=1:size=128x128:rate=15",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=1",
            "-c:v",
            "libx265",
            "-c:a",
            "aac",
            "-shortest",
        ])
        .arg(&src)
        .status()
        .unwrap();
    assert!(status.success());

    let state_file = dir.path().join("state.json");
    let store = reel::state::StateStore::load(state_file).unwrap();

    let entry = reel::state::Metadata {
        id: "test-hls".to_string(),
        name: "test-clip".to_string(),
        path: dir.path().display().to_string(),
        size: 1024,
        completed_at: Some(0),
        last_access: 0,
        state: reel::state::TorrentState::Seeding,
        transcode: reel::state::TranscodeStatus::None,
        transcode_path: None,
        transcode_error: None,
        hls: reel::state::HlsStatus::None,
        hls_dir: None,
        hls_error: None,
    };
    store.upsert(entry).unwrap();

    let mgr = reel::hls::HlsManager::new(store.clone(), 1, "ffmpeg".into(), 4, true);
    let outcome = mgr
        .request("test-hls", reel::transcode::Delivery::TranscodeHls)
        .await;
    assert_eq!(outcome, reel::hls::StartOutcome::Started);

    let hls_dir = dir.path().join("hls");
    let index = hls_dir.join("index.m3u8");

    for _ in 0..120 {
        if index.exists() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    assert!(index.exists(), "index.m3u8 not found");

    let segments: Vec<_> = std::fs::read_dir(&hls_dir)
        .unwrap()
        .filter_map(|e| {
            e.ok().and_then(|ent| {
                let name = ent.file_name();
                let name_str = name.to_string_lossy();
                if name_str.starts_with("seg") && name_str.ends_with(".ts") {
                    Some(ent.path())
                } else {
                    None
                }
            })
        })
        .collect();
    assert!(!segments.is_empty(), "no segment files found");

    let manifest = std::fs::read_to_string(&index).unwrap();
    assert!(
        manifest.contains(".ts"),
        "manifest does not reference .ts segments"
    );
}
