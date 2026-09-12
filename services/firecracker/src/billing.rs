use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Sku {
    Sandbox1,
    Dev2,
    Prod4,
    Max8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct SkuRate {
    pub upfront: u64,
    pub credits_per_sec: u64,
    pub credits_per_1k_requests: u64,
}

pub const fn rate(sku: Sku) -> SkuRate {
    match sku {
        Sku::Sandbox1 => SkuRate {
            upfront: 10,
            credits_per_sec: 1,
            credits_per_1k_requests: 5,
        },
        Sku::Dev2 => SkuRate {
            upfront: 25,
            credits_per_sec: 3,
            credits_per_1k_requests: 10,
        },
        Sku::Prod4 => SkuRate {
            upfront: 100,
            credits_per_sec: 10,
            credits_per_1k_requests: 20,
        },
        Sku::Max8 => SkuRate {
            upfront: 300,
            credits_per_sec: 30,
            credits_per_1k_requests: 50,
        },
    }
}

pub const fn sku_for(vcpu_count: u8, mem_size_mib: u16) -> Sku {
    if vcpu_count <= 1 && mem_size_mib <= 256 {
        Sku::Sandbox1
    } else if vcpu_count <= 2 && mem_size_mib <= 1024 {
        Sku::Dev2
    } else if vcpu_count <= 4 && mem_size_mib <= 4096 {
        Sku::Prod4
    } else {
        Sku::Max8
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub struct VmCostBreakdown {
    pub sku: Sku,
    pub upfront: u64,
    pub credits_per_sec: u64,
    pub credits_per_1k_requests: u64,
    pub estimated_duration_secs: u64,
    pub estimated_requests: u64,
    pub estimated_total: u64,
}

pub fn quote(
    vcpu_count: u8,
    mem_size_mib: u16,
    duration_secs: u64,
    expected_requests: u64,
) -> VmCostBreakdown {
    let sku = sku_for(vcpu_count, mem_size_mib);
    let r = rate(sku);
    let runtime_cost = r.credits_per_sec.saturating_mul(duration_secs);
    let request_cost = (expected_requests / 1000).saturating_mul(r.credits_per_1k_requests);
    VmCostBreakdown {
        sku,
        upfront: r.upfront,
        credits_per_sec: r.credits_per_sec,
        credits_per_1k_requests: r.credits_per_1k_requests,
        estimated_duration_secs: duration_secs,
        estimated_requests: expected_requests,
        estimated_total: r
            .upfront
            .saturating_add(runtime_cost)
            .saturating_add(request_cost),
    }
}

pub fn meter_tick(
    vcpu_count: u8,
    mem_size_mib: u16,
    elapsed_secs: u64,
    requests_delta: u64,
) -> u64 {
    let r = rate(sku_for(vcpu_count, mem_size_mib));
    let runtime = r.credits_per_sec.saturating_mul(elapsed_secs);
    let req = (requests_delta / 1000).saturating_mul(r.credits_per_1k_requests);
    runtime.saturating_add(req)
}

pub const HOLD_FLOOR_SECS: u64 = 3600;

pub fn hold_amount(
    vcpu_count: u8,
    mem_size_mib: u16,
    idle_ttl_secs: u32,
    expected_requests_over_ttl: u64,
) -> u64 {
    let window = std::cmp::max(idle_ttl_secs as u64, HOLD_FLOOR_SECS);
    quote(vcpu_count, mem_size_mib, window, expected_requests_over_ttl).estimated_total
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sku_buckets_match_documented_caps() {
        assert_eq!(sku_for(1, 128), Sku::Sandbox1);
        assert_eq!(sku_for(1, 256), Sku::Sandbox1);
        assert_eq!(sku_for(1, 257), Sku::Dev2);
        assert_eq!(sku_for(2, 1024), Sku::Dev2);
        assert_eq!(sku_for(2, 1025), Sku::Prod4);
        assert_eq!(sku_for(4, 4096), Sku::Prod4);
        assert_eq!(sku_for(4, 4097), Sku::Max8);
        assert_eq!(sku_for(8, 8192), Sku::Max8);
    }

    #[test]
    fn sku_picks_smallest_fitting_bucket_for_low_mem_high_cpu() {
        assert_eq!(sku_for(4, 128), Sku::Prod4);
        assert_eq!(sku_for(1, 8192), Sku::Max8);
    }

    #[test]
    fn sku_clamps_over_spec_to_max8_without_panic() {
        assert_eq!(sku_for(u8::MAX, u16::MAX), Sku::Max8);
        assert_eq!(sku_for(16, 16_384), Sku::Max8);
    }

    #[test]
    fn rate_increases_monotonically_through_skus() {
        let r1 = rate(Sku::Sandbox1);
        let r2 = rate(Sku::Dev2);
        let r3 = rate(Sku::Prod4);
        let r4 = rate(Sku::Max8);
        assert!(r1.upfront < r2.upfront);
        assert!(r2.upfront < r3.upfront);
        assert!(r3.upfront < r4.upfront);
        assert!(r1.credits_per_sec < r2.credits_per_sec);
        assert!(r2.credits_per_sec < r3.credits_per_sec);
        assert!(r3.credits_per_sec < r4.credits_per_sec);
    }

    #[test]
    fn quote_sums_upfront_plus_runtime_plus_request_surcharge() {
        let q = quote(2, 512, 3600, 5_000);
        assert_eq!(q.sku, Sku::Dev2);
        assert_eq!(q.upfront, 25);
        assert_eq!(q.credits_per_sec, 3);
        assert_eq!(q.credits_per_1k_requests, 10);
        assert_eq!(q.estimated_total, 25 + 3 * 3600 + 5 * 10);
    }

    #[test]
    fn quote_with_zero_duration_only_charges_upfront() {
        let q = quote(1, 128, 0, 0);
        assert_eq!(q.estimated_total, rate(Sku::Sandbox1).upfront);
    }

    #[test]
    fn quote_with_zero_requests_only_charges_runtime_plus_upfront() {
        let q = quote(1, 128, 600, 0);
        let r = rate(Sku::Sandbox1);
        assert_eq!(q.estimated_total, r.upfront + r.credits_per_sec * 600);
    }

    #[test]
    fn quote_rounds_request_surcharge_down_to_full_1k_buckets() {
        let q_under = quote(1, 128, 0, 999);
        assert_eq!(q_under.estimated_total, rate(Sku::Sandbox1).upfront);
        let q_one = quote(1, 128, 0, 1_000);
        assert_eq!(
            q_one.estimated_total,
            rate(Sku::Sandbox1).upfront + rate(Sku::Sandbox1).credits_per_1k_requests
        );
        let q_partial = quote(1, 128, 0, 1_999);
        assert_eq!(q_partial.estimated_total, q_one.estimated_total);
    }

    #[test]
    fn quote_saturates_on_overflow_without_panic() {
        let q = quote(8, 8_192, u64::MAX, u64::MAX);
        assert_eq!(q.estimated_total, u64::MAX);
    }

    #[test]
    fn meter_tick_matches_quote_minus_upfront() {
        let v = quote(4, 2048, 1_800, 3_000);
        let tick = meter_tick(4, 2048, 1_800, 3_000);
        assert_eq!(tick, v.estimated_total - v.upfront);
    }

    #[test]
    fn meter_tick_zero_inputs_is_zero() {
        assert_eq!(meter_tick(1, 128, 0, 0), 0);
        assert_eq!(meter_tick(8, 8_192, 0, 0), 0);
    }

    #[test]
    fn meter_tick_saturates_without_panic() {
        let _ = meter_tick(8, 8_192, u64::MAX, u64::MAX);
    }

    #[test]
    fn hold_amount_uses_floor_when_ttl_zero() {
        let h = hold_amount(1, 128, 0, 0);
        let r = rate(Sku::Sandbox1);
        assert_eq!(h, r.upfront + r.credits_per_sec * HOLD_FLOOR_SECS);
    }

    #[test]
    fn hold_amount_uses_ttl_when_above_floor() {
        let ttl_secs: u32 = 4 * 3600;
        let h = hold_amount(2, 512, ttl_secs, 0);
        let r = rate(Sku::Dev2);
        assert_eq!(h, r.upfront + r.credits_per_sec * ttl_secs as u64);
    }

    #[test]
    fn hold_amount_includes_request_surcharge() {
        let h = hold_amount(2, 512, 3_600, 10_000);
        let q = quote(2, 512, HOLD_FLOOR_SECS, 10_000);
        assert_eq!(h, q.estimated_total);
    }

    #[test]
    fn sku_kebab_case_serializes_for_dashboard_consumption() {
        assert_eq!(
            serde_json::to_string(&Sku::Sandbox1).unwrap(),
            "\"sandbox1\""
        );
        assert_eq!(serde_json::to_string(&Sku::Dev2).unwrap(), "\"dev2\"");
        assert_eq!(serde_json::to_string(&Sku::Prod4).unwrap(), "\"prod4\"");
        assert_eq!(serde_json::to_string(&Sku::Max8).unwrap(), "\"max8\"");
    }
}
