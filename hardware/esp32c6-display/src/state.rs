use core::sync::atomic::{AtomicBool, AtomicI16, AtomicU8, AtomicU32, Ordering};

use crate::board::BACKLIGHT_PCT;

pub static BACKLIGHT: AtomicU8 = AtomicU8::new(BACKLIGHT_PCT);
pub static BACKLIGHT_DIRTY: AtomicBool = AtomicBool::new(false);
pub static DIE_DECICELSIUS: AtomicI16 = AtomicI16::new(0);
pub static PRESSES: AtomicU32 = AtomicU32::new(0);
pub static UPTIME: AtomicU32 = AtomicU32::new(0);
pub static LINKED: AtomicBool = AtomicBool::new(false);
pub static WIFI_LINK: AtomicU8 = AtomicU8::new(Link::Down as u8);
pub static WIFI_IP: AtomicU32 = AtomicU32::new(0);
pub static BBS_LINK: AtomicU8 = AtomicU8::new(Bbs::Idle as u8);

#[derive(Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Link {
    Down = 0,
    Joining = 1,
    Dhcp = 2,
    Up = 3,
    Failed = 4,
}

impl Link {
    pub fn label(self) -> &'static str {
        match self {
            Link::Down => "wifi down",
            Link::Joining => "wifi join",
            Link::Dhcp => "wifi dhcp",
            Link::Up => "wifi up",
            Link::Failed => "wifi fail",
        }
    }

    fn from_u8(value: u8) -> Self {
        match value {
            1 => Link::Joining,
            2 => Link::Dhcp,
            3 => Link::Up,
            4 => Link::Failed,
            _ => Link::Down,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Bbs {
    Idle = 0,
    Resolving = 1,
    Dialing = 2,
    Online = 3,
    Failed = 4,
}

impl Bbs {
    pub fn label(self) -> &'static str {
        match self {
            Bbs::Idle => "bbs idle",
            Bbs::Resolving => "bbs dns",
            Bbs::Dialing => "bbs dial",
            Bbs::Online => "bbs live",
            Bbs::Failed => "bbs fail",
        }
    }

    fn from_u8(value: u8) -> Self {
        match value {
            1 => Bbs::Resolving,
            2 => Bbs::Dialing,
            3 => Bbs::Online,
            4 => Bbs::Failed,
            _ => Bbs::Idle,
        }
    }
}

pub fn set_link(link: Link) {
    WIFI_LINK.store(link as u8, Ordering::Relaxed);
}

pub fn link() -> Link {
    Link::from_u8(WIFI_LINK.load(Ordering::Relaxed))
}

pub fn set_bbs(bbs: Bbs) {
    BBS_LINK.store(bbs as u8, Ordering::Relaxed);
}

pub fn bbs() -> Bbs {
    Bbs::from_u8(BBS_LINK.load(Ordering::Relaxed))
}

pub fn set_ip(octets: [u8; 4]) {
    WIFI_IP.store(u32::from_be_bytes(octets), Ordering::Relaxed);
}

pub fn ip() -> [u8; 4] {
    WIFI_IP.load(Ordering::Relaxed).to_be_bytes()
}

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
