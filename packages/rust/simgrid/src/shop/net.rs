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
    let event = proto::ShopResult {
        action: action.to_string(),
        item_ref: item_ref.to_string(),
        qty,
        ok,
        reason: reason.to_string(),
        balance,
    };
    let payload = proto::encode_inner(&event).unwrap_or_default();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_SHOP,
        to: slot,
        payload,
    });
}
