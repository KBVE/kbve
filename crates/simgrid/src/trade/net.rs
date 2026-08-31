use crate::proto::{self, ServerEvent};
use crate::sim::Outbound;
use crate::trade::session::TradeSession;

fn trade_side(items: &[(String, u32)], accepted: bool) -> proto::TradeSide {
    proto::TradeSide {
        items: items
            .iter()
            .map(|(r, c)| proto::InventoryItem {
                // Trade-offer lines are a ref+qty spec, not concrete instances — no
                // stable id until the goods actually move on completion.
                id: String::new(),
                item_ref: r.clone(),
                count: *c,
            })
            .collect(),
        accepted,
    }
}

pub(crate) fn trade_payload(session: &TradeSession, slot: u16, status: &str) -> Vec<u8> {
    let you = session.side(slot);
    let them = session.side(session.other(slot));
    let event = proto::TradeStateView {
        status: status.to_string(),
        with: session.other(slot),
        you: trade_side(&you.items, you.accepted),
        them: trade_side(&them.items, them.accepted),
    };
    proto::encode_inner(&event).unwrap_or_default()
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
    let event = proto::TradeStateView {
        status: status.to_string(),
        with: 0,
        you: proto::TradeSide {
            items: Vec::new(),
            accepted: false,
        },
        them: proto::TradeSide {
            items: Vec::new(),
            accepted: false,
        },
    };
    let payload = proto::encode_inner(&event).unwrap_or_default();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_TRADE,
        to: proto::PlayerSlot(slot),
        payload,
    });
}
