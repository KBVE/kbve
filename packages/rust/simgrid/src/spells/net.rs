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
    let event = proto::SpellResult {
        caster,
        target,
        spell_ref: spell_ref.to_string(),
        effect: effect.to_string(),
        amount,
        ok,
        reason: reason.to_string(),
    };
    let payload = proto::encode_inner(&event).unwrap_or_default();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_SPELL,
        to: slot,
        payload,
    });
}
