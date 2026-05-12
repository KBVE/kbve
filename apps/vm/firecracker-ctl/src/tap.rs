//! TAP device manager for persistent Firecracker endpoints.
//!
//! Creates `/dev/net/tun` devices in the pod netns, assigns the host-side
//! IP, and tears them down when the VM goes away. Also handles one-time
//! pod-level setup: IP forwarding, NAT MASQUERADE to the VPN tunnel, and
//! FORWARD-chain ACCEPT rules for VM ↔ tunnel traffic.
//!
// Integrated into the VM lifecycle in Phase 2c; until then, the
// public surface is unused by the binary itself.
#![allow(dead_code)]
//!
//! ## Approach
//!
//! We shell out to `ip` and `iptables`. This matches the house style in
//! `firecracker-ctl` (firecracker + jailer are invoked as subprocesses)
//! and keeps the diff small. If this becomes brittle we can swap to
//! `rtnetlink` later.
//!
//! ## Testability
//!
//! The command-assembly helpers (`build_*`) are pure functions that
//! return `Vec<String>` argument lists — they're unit-tested without
//! spawning any processes. The execution wrappers (`run_ip`, `run_iptables`,
//! `create_tap`, etc.) are thin enough that their correctness is verified
//! by integration tests in the cluster rather than here.

use crate::persistent::IpAllocation;
use std::net::Ipv4Addr;

/// TAP interface name prefix. Kept short so that `fctap-{index}` fits
/// the 15-char IFNAMSIZ limit even with the largest pool index we can
/// produce (uint32 → 10 digits, plus `fctap-` = 16 chars; in practice
/// the pool caps at 16384 = 5 digits so we're well under).
pub const TAP_PREFIX: &str = "fctap-";

/// Errors surfacing from TAP / iptables plumbing.
#[derive(Debug)]
pub enum TapError {
    /// Failed to spawn the external command (binary missing, permission, etc.).
    Spawn {
        program: String,
        source: std::io::Error,
    },
    /// The external command ran but exited non-zero.
    CommandFailed {
        program: String,
        args: Vec<String>,
        exit_code: Option<i32>,
        stderr: String,
    },
    /// Allocation produced a TAP name that exceeds IFNAMSIZ.
    NameTooLong(String),
}

impl std::fmt::Display for TapError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TapError::Spawn { program, source } => {
                write!(f, "failed to spawn {program}: {source}")
            }
            TapError::CommandFailed {
                program,
                args,
                exit_code,
                stderr,
            } => {
                let code = exit_code
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| "?".into());
                write!(
                    f,
                    "{program} {args:?} exited with {code}: {}",
                    stderr.trim()
                )
            }
            TapError::NameTooLong(n) => write!(f, "TAP name {n:?} exceeds IFNAMSIZ (15)"),
        }
    }
}

impl std::error::Error for TapError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            TapError::Spawn { source, .. } => Some(source),
            _ => None,
        }
    }
}

/// Compile-time upper bound on Linux interface names (IFNAMSIZ is 16
/// including the terminating NUL).
const IFNAMSIZ_LIMIT: usize = 15;

/// Build the TAP interface name for a given pool slot.
pub fn tap_name(slot: u32) -> Result<String, TapError> {
    let n = format!("{TAP_PREFIX}{slot}");
    if n.len() > IFNAMSIZ_LIMIT {
        return Err(TapError::NameTooLong(n));
    }
    Ok(n)
}

/// Handle to a live TAP device. Keep this alive for the lifetime of the
/// VM; dropping it does NOT tear the TAP down — callers must invoke
/// `TapManager::destroy` explicitly so errors can be surfaced.
#[derive(Debug, Clone)]
pub struct TapDevice {
    pub name: String,
    pub host_ip: Ipv4Addr,
    pub guest_ip: Ipv4Addr,
    pub prefix_len: u8,
}

/// Configuration for the TAP manager. All fields come from env vars
/// so operators can override defaults without rebuilding.
#[derive(Debug, Clone)]
pub struct TapConfig {
    /// UID that the Firecracker jailer runs as. The TAP device is
    /// chowned to this UID so the jailer can open it without CAP_NET_ADMIN
    /// inside the jail.
    pub jailer_uid: u32,
    /// VPN tunnel interface (e.g. `wg0` for WireGuard). VM egress is
    /// MASQUERADE'd out this interface.
    pub tunnel_iface: String,
    /// CIDR of the VM subnet pool (e.g. `172.18.0.0/16`). Used as
    /// the `-s` match for the NAT + FORWARD rules.
    pub vm_subnet: String,
}

impl TapConfig {
    /// Load TAP config from environment variables with sensible defaults.
    pub fn from_env() -> Self {
        let jailer_uid = std::env::var("FC_JAILER_UID")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(10001);
        let tunnel_iface = std::env::var("FC_TUNNEL_IFACE").unwrap_or_else(|_| "wg0".to_string());
        let vm_subnet =
            std::env::var("FC_PERSISTENT_SUBNET").unwrap_or_else(|_| "172.18.0.0/16".to_string());
        Self {
            jailer_uid,
            tunnel_iface,
            vm_subnet,
        }
    }
}

// ---------------------------------------------------------------------------
// Pure command-assembly helpers (unit-tested)
// ---------------------------------------------------------------------------

/// `ip tuntap add dev {name} mode tap user {uid}` — create the TAP.
pub fn build_tap_create(name: &str, jailer_uid: u32) -> Vec<String> {
    vec![
        "tuntap".into(),
        "add".into(),
        "dev".into(),
        name.into(),
        "mode".into(),
        "tap".into(),
        "user".into(),
        jailer_uid.to_string(),
    ]
}

/// `ip addr add {host_ip}/{prefix} dev {name}` — assign the host-side IP.
pub fn build_addr_add(name: &str, host_ip: Ipv4Addr, prefix_len: u8) -> Vec<String> {
    vec![
        "addr".into(),
        "add".into(),
        format!("{host_ip}/{prefix_len}"),
        "dev".into(),
        name.into(),
    ]
}

/// `ip link set dev {name} up` — bring the TAP up.
pub fn build_link_up(name: &str) -> Vec<String> {
    vec![
        "link".into(),
        "set".into(),
        "dev".into(),
        name.into(),
        "up".into(),
    ]
}

/// `ip link del dev {name}` — delete the TAP (removes IP + state atomically).
pub fn build_link_del(name: &str) -> Vec<String> {
    vec!["link".into(), "del".into(), "dev".into(), name.into()]
}

/// NAT MASQUERADE rule for VM egress: rewrite source IP of outbound
/// packets from the VM subnet to the tunnel interface's address so
/// the VPN provider sees the tunnel peer rather than a 172.18.* source.
pub fn build_nat_masquerade(vm_subnet: &str, tunnel_iface: &str) -> Vec<String> {
    vec![
        "-t".into(),
        "nat".into(),
        "-A".into(),
        "POSTROUTING".into(),
        "-s".into(),
        vm_subnet.into(),
        "-o".into(),
        tunnel_iface.into(),
        "-j".into(),
        "MASQUERADE".into(),
    ]
}

/// Check variant of the NAT MASQUERADE rule. `iptables -C` returns
/// exit 0 if the rule exists, 1 otherwise — we use it to make the
/// install idempotent without duplicating rules on restart.
pub fn build_nat_masquerade_check(vm_subnet: &str, tunnel_iface: &str) -> Vec<String> {
    let mut v = build_nat_masquerade(vm_subnet, tunnel_iface);
    // Replace -A with -C
    if let Some(a) = v.iter_mut().find(|s| s.as_str() == "-A") {
        *a = "-C".into();
    }
    v
}

/// FORWARD rule allowing outbound traffic from the VM subnet onto the
/// tunnel interface.
pub fn build_forward_out(vm_subnet: &str, tunnel_iface: &str) -> Vec<String> {
    vec![
        "-A".into(),
        "FORWARD".into(),
        "-s".into(),
        vm_subnet.into(),
        "-o".into(),
        tunnel_iface.into(),
        "-j".into(),
        "ACCEPT".into(),
    ]
}

pub fn build_forward_out_check(vm_subnet: &str, tunnel_iface: &str) -> Vec<String> {
    let mut v = build_forward_out(vm_subnet, tunnel_iface);
    if let Some(a) = v.iter_mut().find(|s| s.as_str() == "-A") {
        *a = "-C".into();
    }
    v
}

/// FORWARD rule allowing reply traffic from the tunnel back to the
/// VM subnet when the VM initiated the flow. `--ctstate` is the modern
/// conntrack match; `--state` is still accepted by most distros for
/// compatibility.
pub fn build_forward_return(vm_subnet: &str, tunnel_iface: &str) -> Vec<String> {
    vec![
        "-A".into(),
        "FORWARD".into(),
        "-i".into(),
        tunnel_iface.into(),
        "-d".into(),
        vm_subnet.into(),
        "-m".into(),
        "state".into(),
        "--state".into(),
        "ESTABLISHED,RELATED".into(),
        "-j".into(),
        "ACCEPT".into(),
    ]
}

pub fn build_forward_return_check(vm_subnet: &str, tunnel_iface: &str) -> Vec<String> {
    let mut v = build_forward_return(vm_subnet, tunnel_iface);
    if let Some(a) = v.iter_mut().find(|s| s.as_str() == "-A") {
        *a = "-C".into();
    }
    v
}

pub fn build_input_accept(vm_subnet: &str) -> Vec<String> {
    vec![
        "-I".into(),
        "INPUT".into(),
        "-s".into(),
        vm_subnet.into(),
        "-j".into(),
        "ACCEPT".into(),
    ]
}

pub fn build_input_accept_check(vm_subnet: &str) -> Vec<String> {
    vec![
        "-C".into(),
        "INPUT".into(),
        "-s".into(),
        vm_subnet.into(),
        "-j".into(),
        "ACCEPT".into(),
    ]
}

pub fn build_dns_dnat(proto: &str) -> Vec<String> {
    vec![
        "-t".into(),
        "nat".into(),
        "-I".into(),
        "PREROUTING".into(),
        "-i".into(),
        "fctap+".into(),
        "-p".into(),
        proto.into(),
        "--dport".into(),
        "53".into(),
        "-j".into(),
        "DNAT".into(),
        "--to-destination".into(),
        "127.0.0.1:53".into(),
    ]
}

pub fn build_dns_dnat_check(proto: &str) -> Vec<String> {
    let mut v = build_dns_dnat(proto);
    if let Some(a) = v.iter_mut().find(|s| s.as_str() == "-I") {
        *a = "-C".into();
    }
    v
}

// ---------------------------------------------------------------------------
// Execution wrappers (shell-out via tokio::process::Command)
// ---------------------------------------------------------------------------

/// Run an external command to completion and surface structured errors.
/// Internal helper shared by `run_ip` and `run_iptables`.
async fn run(program: &str, args: &[String]) -> Result<String, TapError> {
    let output = tokio::process::Command::new(program)
        .args(args)
        .output()
        .await
        .map_err(|e| TapError::Spawn {
            program: program.to_string(),
            source: e,
        })?;

    if !output.status.success() {
        return Err(TapError::CommandFailed {
            program: program.to_string(),
            args: args.to_vec(),
            exit_code: output.status.code(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Run `ip {args...}`.
pub async fn run_ip(args: &[String]) -> Result<String, TapError> {
    run("ip", args).await
}

/// Run `iptables {args...}`.
pub async fn run_iptables(args: &[String]) -> Result<String, TapError> {
    run("iptables", args).await
}

/// Rule-present check: returns Ok(true) if `iptables -C` succeeds,
/// Ok(false) if it exits non-zero (rule not present), or an error if
/// iptables itself failed to execute.
async fn iptables_rule_exists(check_args: &[String]) -> Result<bool, TapError> {
    let output = tokio::process::Command::new("iptables")
        .args(check_args)
        .output()
        .await
        .map_err(|e| TapError::Spawn {
            program: "iptables".into(),
            source: e,
        })?;
    Ok(output.status.success())
}

// ---------------------------------------------------------------------------
// TapManager — public surface
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct TapManager {
    config: TapConfig,
}

impl TapManager {
    pub fn new(config: TapConfig) -> Self {
        Self { config }
    }

    pub fn config(&self) -> &TapConfig {
        &self.config
    }

    /// One-time pod-level setup: enable IP forwarding and install
    /// MASQUERADE + FORWARD rules for the VM subnet ↔ tunnel path.
    /// Idempotent — safe to call on every startup.
    pub async fn init(&self) -> Result<(), TapError> {
        // 1. IP forwarding
        run("sysctl", &["-w".into(), "net.ipv4.ip_forward=1".into()]).await?;

        // route_localnet=1 allows DNAT to 127.0.0.1 for forwarded packets
        // arriving on TAP interfaces. Required for the DNS redirect below.
        run(
            "sysctl",
            &["-w".into(), "net.ipv4.conf.all.route_localnet=1".into()],
        )
        .await?;

        // 2. NAT MASQUERADE (add only if not already present)
        if !iptables_rule_exists(&build_nat_masquerade_check(
            &self.config.vm_subnet,
            &self.config.tunnel_iface,
        ))
        .await?
        {
            run_iptables(&build_nat_masquerade(
                &self.config.vm_subnet,
                &self.config.tunnel_iface,
            ))
            .await?;
        }

        // 3. FORWARD: VM → tunnel
        if !iptables_rule_exists(&build_forward_out_check(
            &self.config.vm_subnet,
            &self.config.tunnel_iface,
        ))
        .await?
        {
            run_iptables(&build_forward_out(
                &self.config.vm_subnet,
                &self.config.tunnel_iface,
            ))
            .await?;
        }

        // 4. FORWARD: tunnel → VM (reply traffic only)
        if !iptables_rule_exists(&build_forward_return_check(
            &self.config.vm_subnet,
            &self.config.tunnel_iface,
        ))
        .await?
        {
            run_iptables(&build_forward_return(
                &self.config.vm_subnet,
                &self.config.tunnel_iface,
            ))
            .await?;
        }

        if !iptables_rule_exists(&build_input_accept_check(&self.config.vm_subnet)).await? {
            run_iptables(&build_input_accept(&self.config.vm_subnet)).await?;
        }

        for proto in ["udp", "tcp"] {
            if !iptables_rule_exists(&build_dns_dnat_check(proto)).await? {
                run_iptables(&build_dns_dnat(proto)).await?;
            }
        }

        Ok(())
    }

    /// Create a TAP device for the given IP allocation, assign the
    /// host-side IP, and bring the interface up.
    pub async fn create_tap(&self, allocation: &IpAllocation) -> Result<TapDevice, TapError> {
        let name = tap_name(allocation.slot_index())?;

        run_ip(&build_tap_create(&name, self.config.jailer_uid)).await?;
        run_ip(&build_addr_add(
            &name,
            allocation.host_ip,
            allocation.prefix_len,
        ))
        .await?;
        run_ip(&build_link_up(&name)).await?;

        Ok(TapDevice {
            name,
            host_ip: allocation.host_ip,
            guest_ip: allocation.guest_ip,
            prefix_len: allocation.prefix_len,
        })
    }

    /// Delete a TAP device. Swallows "does not exist" errors so cleanup
    /// paths can be called without pre-checking.
    pub async fn destroy_tap(&self, tap: &TapDevice) -> Result<(), TapError> {
        match run_ip(&build_link_del(&tap.name)).await {
            Ok(_) => Ok(()),
            Err(TapError::CommandFailed { stderr, .. })
                if stderr.contains("Cannot find device") || stderr.contains("does not exist") =>
            {
                Ok(())
            }
            Err(e) => Err(e),
        }
    }
}

// ---------------------------------------------------------------------------
// Tests — command-builder helpers only (no shell-out)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistent::Ipv4Pool;

    #[test]
    fn tap_name_fits_ifnamsiz() {
        assert_eq!(tap_name(0).unwrap(), "fctap-0");
        assert_eq!(tap_name(42).unwrap(), "fctap-42");
        // Max slot index in a /16 pool = 16383 (5 digits) → 11 chars — fits.
        assert_eq!(tap_name(16383).unwrap(), "fctap-16383");
    }

    #[test]
    fn tap_name_rejects_overflow() {
        // Forged 10-digit index to exceed the 15-char limit.
        let huge = u32::MAX;
        let name = format!("{TAP_PREFIX}{huge}");
        assert!(name.len() > IFNAMSIZ_LIMIT);
        assert!(matches!(tap_name(huge), Err(TapError::NameTooLong(_))));
    }

    #[test]
    fn build_tap_create_matches_iproute2() {
        let args = build_tap_create("fctap-7", 10001);
        assert_eq!(
            args,
            vec![
                "tuntap", "add", "dev", "fctap-7", "mode", "tap", "user", "10001"
            ]
        );
    }

    #[test]
    fn build_addr_add_includes_cidr() {
        let args = build_addr_add("fctap-7", Ipv4Addr::new(172, 18, 0, 29), 30);
        assert_eq!(
            args,
            vec!["addr", "add", "172.18.0.29/30", "dev", "fctap-7"]
        );
    }

    #[test]
    fn build_link_up_is_simple() {
        assert_eq!(
            build_link_up("fctap-7"),
            vec!["link", "set", "dev", "fctap-7", "up"]
        );
    }

    #[test]
    fn build_link_del_is_simple() {
        assert_eq!(
            build_link_del("fctap-7"),
            vec!["link", "del", "dev", "fctap-7"]
        );
    }

    #[test]
    fn masquerade_rule_is_pool_scoped() {
        let args = build_nat_masquerade("172.18.0.0/16", "wg0");
        assert_eq!(
            args,
            vec![
                "-t",
                "nat",
                "-A",
                "POSTROUTING",
                "-s",
                "172.18.0.0/16",
                "-o",
                "wg0",
                "-j",
                "MASQUERADE",
            ]
        );
    }

    #[test]
    fn masquerade_check_swaps_add_for_check() {
        let add = build_nat_masquerade("172.18.0.0/16", "wg0");
        let check = build_nat_masquerade_check("172.18.0.0/16", "wg0");
        assert!(add.contains(&"-A".to_string()));
        assert!(check.contains(&"-C".to_string()));
        assert!(!check.contains(&"-A".to_string()));
        // Everything else is identical
        let stripped = |v: Vec<String>| -> Vec<String> {
            v.into_iter().filter(|s| s != "-A" && s != "-C").collect()
        };
        assert_eq!(stripped(add), stripped(check));
    }

    #[test]
    fn forward_out_rule_matches_subnet_and_iface() {
        assert_eq!(
            build_forward_out("172.18.0.0/16", "wg0"),
            vec![
                "-A",
                "FORWARD",
                "-s",
                "172.18.0.0/16",
                "-o",
                "wg0",
                "-j",
                "ACCEPT",
            ]
        );
    }

    #[test]
    fn forward_return_limits_to_established_related() {
        let args = build_forward_return("172.18.0.0/16", "wg0");
        assert!(args.contains(&"ESTABLISHED,RELATED".to_string()));
        assert!(args.contains(&"-i".to_string()));
        assert!(args.contains(&"-d".to_string()));
    }

    #[test]
    fn forward_checks_all_swap_add_for_check() {
        let out_check = build_forward_out_check("10.0.0.0/16", "tun0");
        let ret_check = build_forward_return_check("10.0.0.0/16", "tun0");
        assert!(out_check.contains(&"-C".to_string()));
        assert!(ret_check.contains(&"-C".to_string()));
        assert!(!out_check.contains(&"-A".to_string()));
        assert!(!ret_check.contains(&"-A".to_string()));
    }

    #[test]
    fn config_from_env_uses_defaults_when_unset() {
        // Only run in a controlled env — clear the relevant vars first.
        // SAFETY: tests run single-threaded only for env-var isolation.
        unsafe {
            std::env::remove_var("FC_JAILER_UID");
            std::env::remove_var("FC_TUNNEL_IFACE");
            std::env::remove_var("FC_PERSISTENT_SUBNET");
        }
        let cfg = TapConfig::from_env();
        assert_eq!(cfg.jailer_uid, 10001);
        assert_eq!(cfg.tunnel_iface, "wg0");
        assert_eq!(cfg.vm_subnet, "172.18.0.0/16");
    }

    #[test]
    fn allocation_to_tap_name_is_stable() {
        let pool = Ipv4Pool::new(Ipv4Addr::new(172, 18, 0, 0), 16).unwrap();
        let a = pool.allocate().unwrap();
        let b = pool.allocate().unwrap();
        assert_eq!(tap_name(a.slot_index()).unwrap(), "fctap-0");
        assert_eq!(tap_name(b.slot_index()).unwrap(), "fctap-1");
    }
}
