//! Desktop pool behaviour; wasm paths need a browser and are not covered here.
#![cfg(not(target_arch = "wasm32"))]

use std::future::Future;
use std::pin::Pin;
use std::rc::Rc;
use std::sync::mpsc;
use std::task::{Context, Poll};
use std::time::Duration;

use bevy_tasker::{spawn, spawn_local};

const WAIT: Duration = Duration::from_secs(5);

/// Suspends once, so a future holding a `!Send` value keeps it across a yield.
struct YieldOnce(bool);

impl Future for YieldOnce {
    type Output = ();

    fn poll(mut self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<()> {
        if self.0 {
            return Poll::Ready(());
        }
        self.0 = true;
        context.waker().wake_by_ref();
        Poll::Pending
    }
}

#[test]
fn a_spawned_future_runs_to_completion() {
    let (sender, receiver) = mpsc::channel();
    spawn(async move {
        sender.send(7u32).unwrap();
    })
    .detach();
    assert_eq!(receiver.recv_timeout(WAIT).unwrap(), 7);
}

#[test]
fn spawn_local_carries_a_non_send_value_across_a_yield() {
    let (sender, receiver) = mpsc::channel();
    spawn_local(async move {
        let local = Rc::new(5u32);
        YieldOnce(false).await;
        sender.send(*local).unwrap();
    })
    .detach();
    assert_eq!(receiver.recv_timeout(WAIT).unwrap(), 5);
}

#[test]
fn every_spawned_task_runs() {
    let (sender, receiver) = mpsc::channel();
    for index in 0..64u32 {
        let sender = sender.clone();
        spawn(async move {
            sender.send(index).unwrap();
        })
        .detach();
    }
    drop(sender);

    let mut seen = Vec::new();
    for _ in 0..64 {
        seen.push(receiver.recv_timeout(WAIT).unwrap());
    }
    seen.sort_unstable();
    assert_eq!(seen, (0..64).collect::<Vec<_>>());
}

#[test]
fn a_task_resolves_to_its_output_when_awaited() {
    let (sender, receiver) = mpsc::channel();
    spawn(async move {
        let inner = spawn(async { 21u32 });
        sender.send(inner.await * 2).unwrap();
    })
    .detach();
    assert_eq!(receiver.recv_timeout(WAIT).unwrap(), 42);
}

#[test]
fn the_pool_survives_more_panics_than_it_has_threads() {
    let threads = std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(4);
    for _ in 0..threads * 2 {
        spawn(async {
            panic!("task under test");
        })
        .detach();
    }
    let (sender, receiver) = mpsc::channel();
    spawn(async move {
        sender.send(1u32).unwrap();
    })
    .detach();
    assert_eq!(
        receiver.recv_timeout(WAIT).ok(),
        Some(1),
        "pool stopped running work after {} panicking tasks",
        threads * 2
    );
}
