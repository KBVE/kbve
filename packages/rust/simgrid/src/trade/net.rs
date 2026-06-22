use serde_json::json;

use crate::proto::{self, ServerEvent};
use crate::sim::Outbound;
use crate::trade::session::TradeSession;

pub(crate) fn trade_payload(session: &TradeSession, slot: u16, status: &str) -> Vec<u8> {
    let you = session.side(slot);
    let them = session.side(session.other(slot));
    let map_items = |items: &[(String, u32)]| -> Vec<serde_json::Value> {
        items
            .iter()
            .map(|(r, c)| json!({ "ref": r, "count": c }))
            .collect()
    };
    json!({
        "status": status,
        "with": session.other(slot),
        "you": { "items": map_items(&you.items), "accepted": you.accepted },
        "them": { "items": map_items(&them.items), "accepted": them.accepted },
    })
    .to_string()
    .into_bytes()
}

pub(crate) fn send_trade(bcast: &Outbound, session: &TradeSession, status: &str) {
    for slot in [session.a, session.b] {
        let _ = bcast.tx.send(ServerEvent::Ephemeral {
            kind: proto::EPHEMERAL_TRADE,
            to: proto::PlayerSlot(slot),
            payload: trade_payload(session, slot, status),
        });
    }
}

pub(crate) fn send_trade_closed(bcast: &Outbound, slot: u16, status: &str) {
    let payload = json!({ "status": status }).to_string().into_bytes();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_TRADE,
        to: proto::PlayerSlot(slot),
        payload,
    });
}
