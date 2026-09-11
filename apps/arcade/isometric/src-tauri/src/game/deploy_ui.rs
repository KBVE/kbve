//! Deploy mode — pressing `G` deploys the first deployable item in the
//! player's inventory at the player's current tile. The full cursor-tracked
//! ghost preview is deferred until the camera/raycast plumbing lands; for
//! now we just fire the server request from the player's stand-on tile and
//! let the server's ItemDeployed broadcast handle visualisation.

use bevy::prelude::*;
use bevy_inventory::Inventory;

use super::inventory::ItemKind;
use super::net::DeployRequestEvent;
use super::phase::GamePhase;
use super::player::Player;
use super::tilemap::TILE_SIZE;
use super::toast::Toast;

pub struct DeployUiPlugin;

impl Plugin for DeployUiPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(
            Update,
            dispatch_deploy_key.run_if(in_state(GamePhase::Playing)),
        );
    }
}

fn dispatch_deploy_key(
    keys: Res<ButtonInput<KeyCode>>,
    inventory: Res<Inventory<ItemKind>>,
    player_q: Query<&Transform, With<Player>>,
    mut writer: MessageWriter<DeployRequestEvent>,
    mut commands: Commands,
) {
    if !keys.just_pressed(KeyCode::KeyG) {
        return;
    }

    let candidate = inventory.items.iter().enumerate().find(|(_, stack)| {
        stack
            .kind
            .item()
            .map(|i| i.deployable.is_some())
            .unwrap_or(false)
    });

    let Some((slot, stack)) = candidate else {
        commands.trigger(Toast::warn("No deployable item in inventory"));
        return;
    };

    let Ok(transform) = player_q.single() else {
        return;
    };
    let tx = (transform.translation.x / TILE_SIZE).floor() as i32;
    let tz = (transform.translation.z / TILE_SIZE).floor() as i32;

    writer.write(DeployRequestEvent {
        inventory_slot: slot as u32,
        tile_tx: tx,
        tile_tz: tz,
    });

    let name = stack
        .kind
        .item()
        .map(|i| i.name.clone())
        .unwrap_or_else(|| "item".into());
    commands.trigger(Toast::info(format!("Deploying {name} at ({tx},{tz})")));
}
