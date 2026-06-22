use serde_json::json;

use crate::proto::{self, ServerEvent};
use crate::sim::Outbound;

#[allow(clippy::too_many_arguments)]
pub(crate) fn send_shop_result(
    bcast: &Outbound,
    slot: proto::PlayerSlot,
    action: &str,
    item_ref: &str,
    qty: u32,
    ok: bool,
    reason: &str,
    balance: u32,
) {
    let payload = json!({
        "action": action,
        "item_ref": item_ref,
        "qty": qty,
        "ok": ok,
        "reason": reason,
        "balance": balance,
    })
    .to_string()
    .into_bytes();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_SHOP,
        to: slot,
        payload,
    });
}
