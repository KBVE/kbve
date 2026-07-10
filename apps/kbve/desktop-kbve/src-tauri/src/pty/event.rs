#[derive(Debug, Clone)]
pub enum PtyEvent {
    Data { pane_id: String, bytes: Vec<u8> },
    Exit { pane_id: String, code: Option<i32> },
}
