//! The graphs, and how a conversation moves through one.

use std::collections::HashMap;

use bevy::prelude::*;
use prost::Message;

use crate::context::DialogueContext;
use crate::proto::{
    DialogueChoice, DialogueEffectKind, DialogueGraph, DialogueNode, DialogueNodeKind, dialogue,
};

/// The enums in `kbve.dialogue.v1`, for resolving canonical proto JSON.
///
/// Listed by hand because nothing enumerates a package's enums at runtime. An
/// enum left off fails loudly: its names stay strings and the deserializer
/// reports the one it could not read.
fn dialogue_enum_resolver() -> impl Fn(&str) -> Option<i32> {
    kbve_proto::enum_resolver!(DialogueNodeKind, DialogueEffectKind)
}

/// A choice as it should be presented.
///
/// The schema distinguishes a choice that is hidden from one shown greyed out,
/// and losing that distinction is losing the authoring intent: an option the
/// player can see but not take is telling them something.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct OfferedChoice<'a> {
    pub choice: &'a DialogueChoice,
    /// False when its condition fails and it is shown anyway.
    pub available: bool,
}

/// Bevy resource holding every conversation graph.
#[derive(Resource, Default)]
pub struct DialogueDb {
    by_ref: HashMap<String, DialogueGraph>,
    /// Graph refs by ULID text, so an NPC's `dialogue_graph_refs` resolves.
    ref_by_ulid: HashMap<String, String>,
}

impl DialogueDb {
    /// Build from a decoded `DialogueRegistry`.
    pub fn from_proto(registry: dialogue::DialogueRegistry) -> Self {
        let mut db = Self::default();
        for graph in registry.graphs {
            db.insert(graph);
        }
        db
    }

    /// Build from a proto-encoded binary.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, prost::DecodeError> {
        Ok(Self::from_proto(dialogue::DialogueRegistry::decode(bytes)?))
    }

    /// Build from a JSON array of graphs.
    ///
    /// The same shape the other content databases load: the array, not the
    /// registry envelope, because the envelope's provenance is not something a
    /// hand-authored file has.
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        let mut value: serde_json::Value = serde_json::from_str(json)?;
        // Canonical proto JSON writes an enum as its name and the generated
        // fields hold an i32, so the names are rewritten before deserializing.
        // Dialogue is hand-authored -- DIALOGUE_NODE_KIND_CHOICE is what an
        // author writes and 2 is what they would have to look up.
        kbve_proto::json_enum_names_to_numbers(&mut value, &dialogue_enum_resolver());
        let graphs: Vec<DialogueGraph> = serde_json::from_value(value)?;
        let mut db = Self::default();
        for graph in graphs {
            db.insert(graph);
        }
        Ok(db)
    }

    pub fn insert(&mut self, graph: DialogueGraph) {
        if let Some(ulid) = kbve_proto::ulid_text(graph.id.as_ref()) {
            self.ref_by_ulid.insert(ulid, graph.r#ref.clone());
        }
        self.by_ref.insert(graph.r#ref.clone(), graph);
    }

    pub fn get(&self, graph_ref: &str) -> Option<&DialogueGraph> {
        self.by_ref.get(graph_ref)
    }

    /// Resolve a graph by the ULID an NPC points at.
    pub fn get_by_ulid(&self, ulid: &str) -> Option<&DialogueGraph> {
        self.by_ref.get(self.ref_by_ulid.get(ulid)?)
    }

    pub fn len(&self) -> usize {
        self.by_ref.len()
    }

    pub fn is_empty(&self) -> bool {
        self.by_ref.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = &DialogueGraph> {
        self.by_ref.values()
    }
}

/// Where a conversation with this graph should open, for this player.
///
/// Entries are tried highest priority first and the first eligible one wins.
/// `None` means the graph has nothing to say right now, which the schema is
/// explicit about: a graph with no eligible entry is not offered at all. That
/// is the difference between an NPC who is quiet today and one who never
/// speaks, and a caller should say something different for each.
pub fn entry_node<'a>(graph: &'a DialogueGraph, ctx: &DialogueContext) -> Option<&'a DialogueNode> {
    let mut entries: Vec<_> = graph.entries.iter().collect();
    // Stable so that equal priorities keep authoring order.
    entries.sort_by_key(|e| std::cmp::Reverse(e.priority.unwrap_or(0)));
    entries
        .into_iter()
        .filter(|e| ctx.allows(e.condition.as_ref(), &graph.r#ref))
        .find_map(|e| node(graph, &e.node_id).filter(|n| node_open(graph, n, ctx)))
}

/// A node by id, or `None` if the graph has no such node.
pub fn node<'a>(graph: &'a DialogueGraph, node_id: &str) -> Option<&'a DialogueNode> {
    graph.nodes.iter().find(|n| n.id == node_id)
}

/// Whether a node can be entered: its condition holds, and a once-only node
/// has not been seen before.
pub fn node_open(graph: &DialogueGraph, node: &DialogueNode, ctx: &DialogueContext) -> bool {
    if node.once.unwrap_or(false) && ctx.seen_nodes.contains(&node_key(graph, &node.id)) {
        return false;
    }
    ctx.allows(node.condition.as_ref(), &graph.r#ref)
}

/// The choices to show at a node, in display order.
///
/// A choice whose condition fails is dropped unless it asked to be shown
/// unavailable, and one already taken under `once` is dropped outright.
pub fn choices<'a>(
    graph: &'a DialogueGraph,
    node: &'a DialogueNode,
    ctx: &DialogueContext,
) -> Vec<OfferedChoice<'a>> {
    let mut offered: Vec<_> = node
        .choices
        .iter()
        .filter(|c| !(c.once.unwrap_or(false) && ctx.taken.contains(&choice_key(graph, node, c))))
        .filter_map(|c| {
            let available = ctx.allows(c.condition.as_ref(), &graph.r#ref);
            if available || c.show_when_unavailable.unwrap_or(false) {
                Some(OfferedChoice { choice: c, available })
            } else {
                None
            }
        })
        .collect();
    offered.sort_by_key(|o| o.choice.order.unwrap_or(0));
    offered
}

/// Where the conversation goes after this node, absent a choice.
///
/// `END` stops regardless of what it names, so an author who leaves a stale
/// `next_node_id` on an end node does not reopen the conversation.
pub fn next_node(node: &DialogueNode) -> Option<&str> {
    if node.kind == DialogueNodeKind::End as i32 {
        return None;
    }
    node.next_node_id.as_deref().filter(|id| !id.is_empty())
}

/// The key a once-only node is remembered under.
pub fn node_key(graph: &DialogueGraph, node_id: &str) -> String {
    format!("{}/{}", graph.r#ref, node_id)
}

/// The key a once-only choice is remembered under.
pub fn choice_key(graph: &DialogueGraph, node: &DialogueNode, choice: &DialogueChoice) -> String {
    format!("{}/{}/{}", graph.r#ref, node.id, choice.id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::{DialogueCondition, DialogueEntry};

    fn graph(entries: Vec<DialogueEntry>, nodes: Vec<DialogueNode>) -> DialogueGraph {
        DialogueGraph {
            r#ref: "mara".into(),
            name: "Mara".into(),
            entries,
            nodes,
            ..Default::default()
        }
    }

    fn line(id: &str) -> DialogueNode {
        DialogueNode {
            id: id.into(),
            kind: DialogueNodeKind::Line as i32,
            texts: vec![format!("text for {id}")],
            ..Default::default()
        }
    }

    fn entry(node_id: &str, priority: i32, condition: Option<DialogueCondition>) -> DialogueEntry {
        DialogueEntry {
            node_id: node_id.into(),
            priority: Some(priority),
            condition,
            ..Default::default()
        }
    }

    fn needs_flag(flag: &str) -> DialogueCondition {
        DialogueCondition {
            required_flags: vec![flag.into()],
            ..Default::default()
        }
    }

    #[test]
    fn highest_priority_eligible_entry_wins() {
        let g = graph(
            vec![
                entry("greet", 0, None),
                entry("welcome_back", 10, Some(needs_flag("met_mara"))),
            ],
            vec![line("greet"), line("welcome_back")],
        );

        let mut ctx = DialogueContext::default();
        assert_eq!(entry_node(&g, &ctx).unwrap().id, "greet");

        ctx.flags.insert("met_mara".into());
        assert_eq!(entry_node(&g, &ctx).unwrap().id, "welcome_back");
    }

    #[test]
    fn a_graph_with_no_eligible_entry_is_not_offered() {
        let g = graph(
            vec![entry("secret", 0, Some(needs_flag("has_key")))],
            vec![line("secret")],
        );
        assert!(entry_node(&g, &DialogueContext::default()).is_none());
    }

    #[test]
    fn an_entry_pointing_at_a_closed_node_falls_through() {
        // The entry itself is unconditional, but the node it names is guarded.
        // The next entry down should still be reachable.
        let mut guarded = line("guarded");
        guarded.condition = Some(needs_flag("has_key"));
        let g = graph(
            vec![entry("guarded", 10, None), entry("greet", 0, None)],
            vec![guarded, line("greet")],
        );
        assert_eq!(
            entry_node(&g, &DialogueContext::default()).unwrap().id,
            "greet"
        );
    }

    #[test]
    fn a_once_node_is_not_entered_twice() {
        let mut node = line("first_meeting");
        node.once = Some(true);
        let g = graph(vec![entry("first_meeting", 0, None)], vec![node]);

        let mut ctx = DialogueContext::default();
        assert!(entry_node(&g, &ctx).is_some());

        ctx.seen_nodes.insert(node_key(&g, "first_meeting"));
        assert!(entry_node(&g, &ctx).is_none());
    }

    #[test]
    fn unavailable_choices_are_hidden_unless_they_ask_not_to_be() {
        let hidden = DialogueChoice {
            id: "hidden".into(),
            label: "Ask about the vault".into(),
            condition: Some(needs_flag("knows_vault")),
            order: Some(1),
            ..Default::default()
        };
        let greyed = DialogueChoice {
            id: "greyed".into(),
            label: "Pay the toll".into(),
            condition: Some(needs_flag("has_coin")),
            show_when_unavailable: Some(true),
            order: Some(0),
            ..Default::default()
        };
        let mut node = line("talk");
        node.choices = vec![hidden, greyed];
        let g = graph(vec![entry("talk", 0, None)], vec![node.clone()]);

        let offered = choices(&g, &node, &DialogueContext::default());
        assert_eq!(offered.len(), 1, "the hidden choice must not be offered");
        assert_eq!(offered[0].choice.id, "greyed");
        assert!(!offered[0].available, "it is shown, but not takeable");
    }

    #[test]
    fn choices_come_back_in_display_order() {
        let mut node = line("talk");
        node.choices = vec![
            DialogueChoice { id: "c".into(), order: Some(2), ..Default::default() },
            DialogueChoice { id: "a".into(), order: Some(0), ..Default::default() },
            DialogueChoice { id: "b".into(), order: Some(1), ..Default::default() },
        ];
        let g = graph(vec![], vec![node.clone()]);
        let ids: Vec<_> = choices(&g, &node, &DialogueContext::default())
            .iter()
            .map(|o| o.choice.id.as_str())
            .collect();
        assert_eq!(ids, ["a", "b", "c"]);
    }

    #[test]
    fn an_end_node_ends_even_with_a_stale_next_id() {
        let mut node = line("farewell");
        node.kind = DialogueNodeKind::End as i32;
        node.next_node_id = Some("greet".into());
        assert_eq!(next_node(&node), None);
    }

    #[test]
    fn graphs_resolve_by_the_ulid_an_npc_points_at() {
        const ULID: &str = "01HQ000000000000000000000A";
        let mut g = graph(vec![], vec![]);
        g.id = Some(kbve_proto::kbve::r#type::v1::Ulid {
            value: ulid::Ulid::from_string(ULID).unwrap().to_bytes().to_vec(),
        });
        let mut db = DialogueDb::default();
        db.insert(g);

        assert!(db.get_by_ulid(ULID).is_some());
        assert!(db.get_by_ulid("01HQ000000000000000000000B").is_none());
        assert!(db.get("mara").is_some());
    }
}
