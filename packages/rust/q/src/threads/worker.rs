use std::thread::{self, JoinHandle};

use crossbeam_channel::{Receiver, Sender};

pub fn spawn_worker<Req, Resp>(
    name: &str,
    rx: Receiver<Req>,
    tx: Sender<Resp>,
    handler: impl Fn(Req) -> Resp + Send + 'static,
) -> JoinHandle<()>
where
    Req: Send + 'static,
    Resp: Send + 'static,
{
    let thread_name = name.to_string();
    thread::Builder::new()
        .name(thread_name)
        .spawn(move || {
            while let Ok(request) = rx.recv() {
                let _ = tx.send(handler(request));
            }
        })
        .expect("Failed to spawn worker thread")
}
