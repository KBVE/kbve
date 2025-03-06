//  TODO - Replace the player2Dnode
//  TODO - drop entity module

use godot::prelude::*;
use crate::entity::npc_entity::{NPCEntity}
use crate::entity::player_entity::{PlayerEntity}

#[derive(GodotClass)]
#[class(base = Node)]
pub struct EntityManager {
    base: Base<Node>,
    local: Gd<PlayerEntity>,
    active_npcs: Vec<>,
    npc_pool: HashMap<String, >
}

#[godot_api]
impl INode for EntityPlayer {

    
    fn init(base: Base<Node) -> Self {
        base,
        local,

    }
}