#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    use avian3d::prelude::*;
    use bevy::prelude::*;
    use isometric_game::game::GamePluginGroup;
    use isometric_game::tauri_plugin::TauriPlugin;

    // Bind localhost OAuth callback listener before anything else so the port
    // is ready when title_screen builds redirect URLs.
    isometric_game::auth::init_local_listener();

    let mut app = App::new();
    app.insert_resource(ClearColor(Color::srgb(0.1, 0.1, 0.15)));

    app.add_plugins((
        bevy::app::PanicHandlerPlugin,
        bevy::log::LogPlugin::default(),
        bevy::app::TaskPoolPlugin::default(),
        bevy::diagnostic::FrameCountPlugin,
        bevy::time::TimePlugin,
        bevy::transform::TransformPlugin,
        bevy::diagnostic::DiagnosticsPlugin,
        bevy::input::InputPlugin,
        bevy::window::WindowPlugin {
            primary_window: Some(bevy::window::Window {
                title: "KBVE Isometric".to_string(),
                ..default()
            }),
            ..default()
        },
        bevy::a11y::AccessibilityPlugin,
        bevy::asset::AssetPlugin {
            file_path: "../public/assets".to_string(),
            ..default()
        },
        bevy::state::app::StatesPlugin,
    ));
    app.add_plugins(bevy::picking::DefaultPickingPlugins);

    #[cfg(any(unix, windows))]
    app.add_plugins(bevy::app::TerminalCtrlCHandlerPlugin);

    app.add_plugins(bevy::diagnostic::FrameTimeDiagnosticsPlugin::default());

    app.add_plugins(
        TauriPlugin::new(|builder| {
            use tauri::Manager;
            builder
                .plugin(tauri_plugin_opener::init())
                .plugin(tauri_plugin_deep_link::init())
                .invoke_handler(tauri::generate_handler![
                    isometric_game::commands::dispatch_action,
                    isometric_game::commands::greet,
                    isometric_game::commands::forward_pointer_move,
                    isometric_game::commands::forward_pointer_button,
                    isometric_game::commands::forward_pointer_enter,
                    isometric_game::commands::forward_pointer_leave,
                    isometric_game::commands::forward_wheel,
                    isometric_game::commands::forward_key,
                    isometric_game::commands::forward_viewport,
                    isometric_game::commands::open_oauth_url,
                    isometric_game::commands::get_signin_state,
                    isometric_game::commands::set_username,
                    isometric_game::commands::send_chat,
                ])
                .setup(|app| {
                    use tauri_plugin_deep_link::DeepLinkExt;
                    let handle = app.handle().clone();
                    app.deep_link().on_open_url(move |event| {
                        let urls = event.urls();
                        for url in urls {
                            isometric_game::commands::handle_deep_link(&handle, url.as_str());
                        }
                    });
                    Ok(())
                })
        })
        .with_post_render_setup(|app| {
            app.add_plugins(PhysicsPlugins::default());
            app.add_plugins(GamePluginGroup);
        }),
    );

    app.run();
}
