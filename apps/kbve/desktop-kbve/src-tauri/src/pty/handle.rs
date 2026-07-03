use std::sync::Mutex;

use portable_pty::{ChildKiller, MasterPty};
use tokio_util::sync::CancellationToken;

pub struct PaneHandle {
    pub master: Mutex<Box<dyn MasterPty + Send>>,
    pub writer: Mutex<Box<dyn std::io::Write + Send>>,
    pub killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    pub cancel: CancellationToken,
}
