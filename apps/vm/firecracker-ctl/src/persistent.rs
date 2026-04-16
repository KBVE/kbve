//! Persistent endpoint machinery — IP allocator, TAP plumbing, proxy
//! forwarding. Lives in firecracker-ctl-net only (the networked ecosystem).
//!
//! Phase 2 step 1: IP allocator. Pure logic, unit-testable without KVM.

use std::collections::HashSet;
use std::net::Ipv4Addr;
use std::sync::Mutex;

/// Errors from the IP pool.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PoolError {
    /// No free /30 slots in the pool.
    Exhausted { used: usize, capacity: usize },
    /// Pool prefix must leave room for at least one /30 — so ≤ 30.
    InvalidPrefix(u8),
    /// Base address is not aligned to the prefix length.
    UnalignedBase(Ipv4Addr, u8),
}

impl std::fmt::Display for PoolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PoolError::Exhausted { used, capacity } => {
                write!(f, "IP pool exhausted ({used} / {capacity})")
            }
            PoolError::InvalidPrefix(p) => write!(f, "invalid prefix /{p} — must be <= 30"),
            PoolError::UnalignedBase(ip, p) => {
                write!(f, "base {ip} is not aligned to prefix /{p}")
            }
        }
    }
}

impl std::error::Error for PoolError {}

/// Handle returned by a successful allocation. Carries both sides of the
/// point-to-point link plus the index needed to release the slot back to
/// the pool.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IpAllocation {
    /// Network address of the /30 (host.host.host.host / 30 aligned).
    pub cidr: Ipv4Addr,
    /// Host side of the TAP — assigned inside the pod netns.
    pub host_ip: Ipv4Addr,
    /// Guest side of the TAP — what the VM advertises on eth0.
    pub guest_ip: Ipv4Addr,
    /// Netmask: always 255.255.255.252 for /30.
    pub netmask: Ipv4Addr,
    /// Prefix length: always 30.
    pub prefix_len: u8,
    /// Slot index inside the pool. Opaque to callers; used by `release`.
    index: u32,
}

impl IpAllocation {
    /// "host_ip/30" — convenient for `ip addr add`.
    pub fn host_cidr(&self) -> String {
        format!("{}/{}", self.host_ip, self.prefix_len)
    }

    /// "guest_ip::host_ip:netmask::eth0:off" — direct drop-in for the
    /// kernel `ip=` boot arg so the guest gets its IP without DHCP.
    pub fn kernel_ip_arg(&self) -> String {
        format!(
            "{guest}::{host}:{mask}::eth0:off",
            guest = self.guest_ip,
            host = self.host_ip,
            mask = self.netmask,
        )
    }
}

/// Pool of `/30` subnets carved from a larger CIDR block (typically a
/// private /16). Each `/30` gives us a 4-IP span: network, host TAP,
/// guest IP, broadcast — exactly what we need per-VM.
///
/// Thread-safe. Allocation is first-free (lowest available index) for
/// deterministic behaviour in tests; release returns the slot for reuse.
pub struct Ipv4Pool {
    /// Base of the pool (e.g. 172.18.0.0).
    base: Ipv4Addr,
    /// Prefix length of the pool (e.g. 16). Kept for introspection/logging
    /// even though capacity is cached separately.
    #[allow(dead_code)]
    prefix_len: u8,
    /// Total /30 slots in the pool = 2^(30 - prefix_len).
    capacity: u32,
    /// Slot indices currently in use.
    allocated: Mutex<HashSet<u32>>,
}

impl Ipv4Pool {
    /// Build a pool from a base address + prefix length.
    pub fn new(base: Ipv4Addr, prefix_len: u8) -> Result<Self, PoolError> {
        if prefix_len > 30 {
            return Err(PoolError::InvalidPrefix(prefix_len));
        }
        if !is_aligned(base, prefix_len) {
            return Err(PoolError::UnalignedBase(base, prefix_len));
        }
        let capacity = 1u32 << (30 - prefix_len);
        Ok(Self {
            base,
            prefix_len,
            capacity,
            allocated: Mutex::new(HashSet::new()),
        })
    }

    /// Parse a CIDR string like "172.18.0.0/16".
    pub fn from_cidr(cidr: &str) -> Result<Self, PoolError> {
        let (addr_str, prefix_str) = cidr.split_once('/').ok_or(PoolError::InvalidPrefix(0))?;
        let addr: Ipv4Addr = addr_str
            .parse()
            .map_err(|_| PoolError::UnalignedBase(Ipv4Addr::UNSPECIFIED, 0))?;
        let prefix: u8 = prefix_str
            .parse()
            .map_err(|_| PoolError::InvalidPrefix(0))?;
        Self::new(addr, prefix)
    }

    /// Total number of /30 slots this pool can hand out.
    pub fn capacity(&self) -> usize {
        self.capacity as usize
    }

    /// Number of /30 slots currently allocated.
    pub fn in_use(&self) -> usize {
        self.allocated.lock().expect("poisoned").len()
    }

    /// Allocate a free /30 slot. Returns `Exhausted` if the pool is full.
    pub fn allocate(&self) -> Result<IpAllocation, PoolError> {
        let mut taken = self.allocated.lock().expect("poisoned");
        if (taken.len() as u32) >= self.capacity {
            return Err(PoolError::Exhausted {
                used: taken.len(),
                capacity: self.capacity as usize,
            });
        }
        // First-free scan. Capacity is bounded (16384 for /16), and this
        // keeps test output deterministic.
        let mut index = 0u32;
        while taken.contains(&index) {
            index += 1;
        }
        taken.insert(index);
        Ok(self.compose(index))
    }

    /// Release a previously-allocated slot back to the pool. No-op if the
    /// slot is already free (double-release is tolerated so callers don't
    /// need to track it through error paths).
    pub fn release(&self, allocation: &IpAllocation) {
        self.allocated
            .lock()
            .expect("poisoned")
            .remove(&allocation.index);
    }

    /// Build the full IpAllocation tuple for a given slot index.
    fn compose(&self, index: u32) -> IpAllocation {
        let base_u32 = u32::from(self.base);
        let cidr_u32 = base_u32 + index * 4;
        let cidr = Ipv4Addr::from(cidr_u32);
        let host_ip = Ipv4Addr::from(cidr_u32 + 1);
        let guest_ip = Ipv4Addr::from(cidr_u32 + 2);
        IpAllocation {
            cidr,
            host_ip,
            guest_ip,
            netmask: Ipv4Addr::new(255, 255, 255, 252),
            prefix_len: 30,
            index,
        }
    }
}

fn is_aligned(addr: Ipv4Addr, prefix_len: u8) -> bool {
    if prefix_len == 0 {
        return true;
    }
    let mask: u32 = !0u32 << (32 - prefix_len);
    (u32::from(addr) & !mask) == 0
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_prefix_greater_than_30() {
        assert!(matches!(
            Ipv4Pool::new(Ipv4Addr::new(172, 18, 0, 0), 31),
            Err(PoolError::InvalidPrefix(31))
        ));
    }

    #[test]
    fn rejects_unaligned_base() {
        // 172.18.0.1 is not aligned to /30
        assert!(matches!(
            Ipv4Pool::new(Ipv4Addr::new(172, 18, 0, 1), 30),
            Err(PoolError::UnalignedBase(_, 30))
        ));
    }

    #[test]
    fn capacity_matches_prefix() {
        assert_eq!(
            Ipv4Pool::new(Ipv4Addr::new(172, 18, 0, 0), 16)
                .unwrap()
                .capacity(),
            16384
        );
        assert_eq!(
            Ipv4Pool::new(Ipv4Addr::new(172, 18, 0, 0), 30)
                .unwrap()
                .capacity(),
            1
        );
        assert_eq!(
            Ipv4Pool::new(Ipv4Addr::new(172, 18, 0, 0), 28)
                .unwrap()
                .capacity(),
            4
        );
    }

    #[test]
    fn first_allocation_is_slot_zero() {
        let pool = Ipv4Pool::new(Ipv4Addr::new(172, 18, 0, 0), 16).unwrap();
        let a = pool.allocate().unwrap();
        assert_eq!(a.cidr, Ipv4Addr::new(172, 18, 0, 0));
        assert_eq!(a.host_ip, Ipv4Addr::new(172, 18, 0, 1));
        assert_eq!(a.guest_ip, Ipv4Addr::new(172, 18, 0, 2));
        assert_eq!(a.netmask, Ipv4Addr::new(255, 255, 255, 252));
        assert_eq!(a.prefix_len, 30);
    }

    #[test]
    fn consecutive_allocations_step_by_four() {
        let pool = Ipv4Pool::new(Ipv4Addr::new(172, 18, 0, 0), 16).unwrap();
        let a = pool.allocate().unwrap();
        let b = pool.allocate().unwrap();
        let c = pool.allocate().unwrap();
        assert_eq!(a.host_ip, Ipv4Addr::new(172, 18, 0, 1));
        assert_eq!(b.host_ip, Ipv4Addr::new(172, 18, 0, 5));
        assert_eq!(c.host_ip, Ipv4Addr::new(172, 18, 0, 9));
        assert_eq!(pool.in_use(), 3);
    }

    #[test]
    fn release_returns_slot_to_pool() {
        let pool = Ipv4Pool::new(Ipv4Addr::new(172, 18, 0, 0), 16).unwrap();
        let a = pool.allocate().unwrap();
        let b = pool.allocate().unwrap();
        pool.release(&a);
        // Next allocate should reclaim slot 0 (lowest free).
        let c = pool.allocate().unwrap();
        assert_eq!(c.host_ip, a.host_ip);
        assert_eq!(pool.in_use(), 2);
        // b is still valid
        assert_eq!(b.host_ip, Ipv4Addr::new(172, 18, 0, 5));
    }

    #[test]
    fn double_release_is_no_op() {
        let pool = Ipv4Pool::new(Ipv4Addr::new(172, 18, 0, 0), 16).unwrap();
        let a = pool.allocate().unwrap();
        pool.release(&a);
        pool.release(&a);
        assert_eq!(pool.in_use(), 0);
    }

    #[test]
    fn exhausts_when_all_slots_taken() {
        // /28 = 4 slots
        let pool = Ipv4Pool::new(Ipv4Addr::new(10, 0, 0, 0), 28).unwrap();
        for _ in 0..4 {
            pool.allocate().unwrap();
        }
        match pool.allocate() {
            Err(PoolError::Exhausted { used, capacity }) => {
                assert_eq!(used, 4);
                assert_eq!(capacity, 4);
            }
            other => panic!("expected Exhausted, got {other:?}"),
        }
    }

    #[test]
    fn allocate_spans_full_pool() {
        let pool = Ipv4Pool::new(Ipv4Addr::new(10, 0, 0, 0), 28).unwrap();
        let a = pool.allocate().unwrap();
        let b = pool.allocate().unwrap();
        let c = pool.allocate().unwrap();
        let d = pool.allocate().unwrap();
        // All four /30s from 10.0.0.0/28: .0, .4, .8, .12
        assert_eq!(a.cidr, Ipv4Addr::new(10, 0, 0, 0));
        assert_eq!(b.cidr, Ipv4Addr::new(10, 0, 0, 4));
        assert_eq!(c.cidr, Ipv4Addr::new(10, 0, 0, 8));
        assert_eq!(d.cidr, Ipv4Addr::new(10, 0, 0, 12));
    }

    #[test]
    fn from_cidr_parses_valid_block() {
        let pool = Ipv4Pool::from_cidr("172.18.0.0/16").unwrap();
        assert_eq!(pool.capacity(), 16384);
        let a = pool.allocate().unwrap();
        assert_eq!(a.host_ip, Ipv4Addr::new(172, 18, 0, 1));
    }

    #[test]
    fn host_cidr_formats_correctly() {
        let pool = Ipv4Pool::new(Ipv4Addr::new(172, 18, 0, 0), 16).unwrap();
        let a = pool.allocate().unwrap();
        assert_eq!(a.host_cidr(), "172.18.0.1/30");
    }

    #[test]
    fn kernel_ip_arg_formats_for_initramfs() {
        let pool = Ipv4Pool::new(Ipv4Addr::new(172, 18, 0, 0), 16).unwrap();
        let a = pool.allocate().unwrap();
        assert_eq!(
            a.kernel_ip_arg(),
            "172.18.0.2::172.18.0.1:255.255.255.252::eth0:off"
        );
    }

    #[test]
    fn allocations_are_isolated_across_threads() {
        use std::sync::Arc;
        use std::thread;

        let pool = Arc::new(Ipv4Pool::new(Ipv4Addr::new(172, 18, 0, 0), 20).unwrap());
        // /20 = 1024 slots. 8 threads × 100 allocations should all be unique.
        let mut handles = Vec::new();
        for _ in 0..8 {
            let p = pool.clone();
            handles.push(thread::spawn(move || {
                let mut ours = Vec::new();
                for _ in 0..100 {
                    ours.push(p.allocate().unwrap().host_ip);
                }
                ours
            }));
        }
        let mut all: Vec<Ipv4Addr> = handles
            .into_iter()
            .flat_map(|h| h.join().unwrap())
            .collect();
        all.sort();
        all.dedup();
        assert_eq!(all.len(), 800);
        assert_eq!(pool.in_use(), 800);
    }
}
