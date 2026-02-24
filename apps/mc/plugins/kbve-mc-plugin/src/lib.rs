#![allow(unused_imports, dead_code)]

use std::sync::Arc;

use pumpkin::plugin::api::Context;
use pumpkin::plugin::player::player_join::PlayerJoinEvent;
use pumpkin::plugin::{BoxFuture, EventHandler, EventPriority};
use pumpkin::server::Server;
use pumpkin_api_macros::plugin_impl;
use pumpkin_util::text::TextComponent;
use pumpkin_util::text::color::NamedColor;

struct WelcomeHandler;

impl EventHandler<PlayerJoinEvent> for WelcomeHandler {
    fn handle<'a>(
        &'a self,
        _server: &'a Arc<Server>,
        event: &'a PlayerJoinEvent,
    ) -> BoxFuture<'a, ()> {
        let player = Arc::clone(&event.player);
        Box::pin(async move {
            let name = &player.gameprofile.name;
            let uuid = player.gameprofile.id;

            let welcome = TextComponent::text(format!("Welcome to KBVE, {name}!"))
                .color_named(NamedColor::Gold)
                .bold();

            let uuid_msg = TextComponent::text(format!("Your UUID: {uuid}"))
                .color_named(NamedColor::Gray)
                .italic();

            player.send_system_message(&welcome).await;
            player.send_system_message(&uuid_msg).await;
        })
    }
}

#[plugin_impl]
pub struct KbveMcPlugin;

impl KbveMcPlugin {
    pub fn new() -> Self {
        Self
    }

    #[pumpkin_api_macros::plugin_method]
    async fn on_load(&mut self, context: Arc<Context>) -> Result<(), String> {
        context
            .register_event(Arc::new(WelcomeHandler), EventPriority::Normal, false)
            .await;
        Ok(())
    }

    #[pumpkin_api_macros::plugin_method]
    async fn on_unload(&mut self, _context: Arc<Context>) -> Result<(), String> {
        Ok(())
    }
}
