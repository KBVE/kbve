use bevy::prelude::*;
use bevy::render::view::screenshot::{Screenshot, save_to_disk};

const SCREENSHOT_FRAME: u32 = 120;

pub struct DebugPlugin;

impl Plugin for DebugPlugin {
    fn build(&self, app: &mut App) {
        if screenshot_path().is_some() {
            app.add_systems(Update, screenshot_when_settled);
        }
    }
}

pub fn screenshot_path() -> Option<String> {
    std::env::var("COLONY_SCREENSHOT").ok()
}

fn screenshot_frame() -> u32 {
    std::env::var("COLONY_SCREENSHOT_FRAME")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(SCREENSHOT_FRAME)
}

fn screenshot_when_settled(
    mut commands: Commands,
    mut frame: Local<u32>,
    mut taken: Local<bool>,
    mut exit: MessageWriter<AppExit>,
) {
    *frame += 1;
    let wait = screenshot_frame();

    if *taken {
        if *frame > wait + 30 {
            exit.write(AppExit::Success);
        }
        return;
    }

    if *frame < wait {
        return;
    }

    let Some(path) = screenshot_path() else {
        return;
    };

    *taken = true;
    commands
        .spawn(Screenshot::primary_window())
        .observe(save_to_disk(path));
}
