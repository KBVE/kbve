use serde_json::json;

use crate::proto::{self, ServerEvent};
use crate::sim::Outbound;

#[allow(clippy::too_many_arguments)]
pub(crate) fn send_spell_result(
    bcast: &Outbound,
    slot: proto::PlayerSlot,
    caster: u32,
    target: Option<u32>,
    spell_ref: &str,
    effect: &str,
    amount: i32,
    ok: bool,
    reason: &str,
) {
    let payload = json!({
        "caster": caster,
        "target": target,
        "spell_ref": spell_ref,
        "effect": effect,
        "amount": amount,
        "ok": ok,
        "reason": reason,
    })
    .to_string()
    .into_bytes();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_SPELL,
        to: slot,
        payload,
    });
}
