use core::sync::atomic::{AtomicBool, AtomicI16, AtomicU32, AtomicU8, Ordering};

use crate::board::BACKLIGHT_PCT;

pub static BACKLIGHT: AtomicU8 = AtomicU8::new(BACKLIGHT_PCT);
pub static BACKLIGHT_DIRTY: AtomicBool = AtomicBool::new(false);
pub static DIE_DECICELSIUS: AtomicI16 = AtomicI16::new(0);
pub static PRESSES: AtomicU32 = AtomicU32::new(0);
pub static UPTIME: AtomicU32 = AtomicU32::new(0);
pub static LINKED: AtomicBool = AtomicBool::new(false);

pub fn request_backlight(pct: u8) {
    BACKLIGHT.store(pct.min(100), Ordering::Relaxed);
    BACKLIGHT_DIRTY.store(true, Ordering::Release);
}

pub fn take_backlight_request() -> Option<u8> {
    if BACKLIGHT_DIRTY.swap(false, Ordering::Acquire) {
        Some(BACKLIGHT.load(Ordering::Relaxed))
    } else {
        None
    }
}

pub fn publish_backlight(pct: u8) {
    BACKLIGHT.store(pct, Ordering::Relaxed);
}

pub fn backlight() -> u8 {
    BACKLIGHT.load(Ordering::Relaxed)
}

pub fn set_die(decicelsius: i16) {
    DIE_DECICELSIUS.store(decicelsius, Ordering::Relaxed);
}

pub fn die() -> i16 {
    DIE_DECICELSIUS.load(Ordering::Relaxed)
}

pub fn set_presses(count: u32) {
    PRESSES.store(count, Ordering::Relaxed);
}

pub fn presses() -> u32 {
    PRESSES.load(Ordering::Relaxed)
}

pub fn set_uptime(seconds: u32) {
    UPTIME.store(seconds, Ordering::Relaxed);
}

pub fn uptime() -> u32 {
    UPTIME.load(Ordering::Relaxed)
}

pub fn set_linked(linked: bool) {
    LINKED.store(linked, Ordering::Relaxed);
}

pub fn linked() -> bool {
    LINKED.load(Ordering::Relaxed)
}
