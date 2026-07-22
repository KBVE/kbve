use std::time::Duration;

#[tokio::test]
#[ignore = "network + vpn required; run manually with a legal torrent"]
async fn leech_move_reap_debian_iso() {
    let magnet = std::env::var("REEL_TEST_MAGNET")
        .expect("set REEL_TEST_MAGNET to a legal torrent (e.g. a Debian ISO)");
    let tmp = tempfile::tempdir().unwrap();
    std::env::set_var("REEL_ACTIVE_DIR", tmp.path().join("active"));
    std::env::set_var("REEL_LIBRARY_DIR", tmp.path().join("library"));
    std::env::set_var("REEL_STATE_FILE", tmp.path().join("state.json"));

    let cfg = reel::config::load_from_env().unwrap();
    let store = reel::state::StateStore::load(cfg.state_file.clone()).unwrap();
    let eng = reel::engine::Engine::start(&cfg, store.clone()).await.unwrap();
    let id = eng.add(&magnet).await.unwrap();

    let mut moved = false;
    for _ in 0..600 {
        if let Some(m) = store.get(&id) {
            if matches!(m.state, reel::state::TorrentState::Seeding) {
                moved = true;
                break;
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    assert!(moved, "torrent did not complete + move within timeout");

    assert!(eng.delete(&id).await.unwrap());
    assert!(store.get(&id).is_none());
}
