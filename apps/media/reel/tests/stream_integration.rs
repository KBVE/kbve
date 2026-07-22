use std::time::Duration;
use tokio::io::AsyncReadExt;

#[tokio::test]
#[ignore = "network + vpn required; run manually with a legal torrent"]
async fn progressive_stream_reads_head_before_complete() {
    let magnet = std::env::var("REEL_TEST_MAGNET").expect("set REEL_TEST_MAGNET");
    let tmp = tempfile::tempdir().unwrap();
    std::env::set_var("REEL_ACTIVE_DIR", tmp.path().join("active"));
    std::env::set_var("REEL_LIBRARY_DIR", tmp.path().join("library"));
    std::env::set_var("REEL_STATE_FILE", tmp.path().join("state.json"));
    let cfg = reel::config::load_from_env().unwrap();
    let store = reel::state::StateStore::load(cfg.state_file.clone()).unwrap();
    let eng = reel::engine::Engine::start(&cfg, store.clone()).await.unwrap();
    let id = eng.add(&magnet).await.unwrap();

    let mut files = None;
    for _ in 0..120 {
        if let Ok(Some(f)) = eng.list_files(&id) { files = Some(f); break; }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    let files = files.expect("metadata resolved");
    let idx = reel::engine::primary_file_index(&files).expect("a media file");
    let mut stream = eng.open_stream(&id, idx).unwrap();
    let mut buf = vec![0u8; 64 * 1024];
    let n = stream.read(&mut buf).await.unwrap();
    assert!(n > 0, "progressive read returned bytes before completion");
}
