use godot::classes::{Control, IControl, Os, ProjectSettings};
use godot::prelude::*;

#[cfg(target_os = "macos")]
use crate::platform::macos::MacOSWryBrowserOptions;
#[cfg(target_os = "windows")]
use crate::platform::windows::WindowsWryBrowserOptions;

#[cfg(any(target_os = "macos", target_os = "windows"))]
use wry::{
    Rect, WebViewBuilder,
    dpi::{PhysicalPosition, PhysicalSize},
    http::Request,
};

#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::{borrow::Cow, fs, path::PathBuf};

#[cfg(any(target_os = "macos", target_os = "windows"))]
use http::{Response, header::CONTENT_TYPE};

#[derive(GodotClass)]
#[class(base = Control)]
pub struct GodotBrowser {
    base: Base<Control>,

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    webview: Option<wry::WebView>,

    full_window_size: bool,
    url: GString,
    html: GString,
    transparent: bool,
    background_color: Color,
    devtools: bool,
    user_agent: GString,
    zoom_hotkeys: bool,
    clipboard: bool,
    incognito: bool,
    focused: bool,
}

#[godot_api]
impl IControl for GodotBrowser {
    fn init(base: Base<Control>) -> Self {
        Self {
            base,

            #[cfg(any(target_os = "macos", target_os = "windows"))]
            webview: None,

            full_window_size: true,
            url: "https://kbve.com/".into(),
            html: "".into(),
            transparent: false,
            background_color: Color::from_rgb(1.0, 1.0, 1.0),
            devtools: true,
            user_agent: "".into(),
            zoom_hotkeys: false,
            clipboard: true,
            incognito: false,
            focused: true,
        }
    }

    fn ready(&mut self) {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            #[cfg(target_os = "macos")]
            let window = MacOSWryBrowserOptions;

            #[cfg(target_os = "windows")]
            let window = WindowsWryBrowserOptions;

            let base = self.base().clone();
            let mut builder = WebViewBuilder::new()
                .with_transparent(self.transparent)
                .with_devtools(self.devtools)
                .with_hotkeys_zoom(self.zoom_hotkeys)
                .with_clipboard(self.clipboard)
                .with_incognito(self.incognito)
                .with_focused(self.focused)
                .with_ipc_handler(move |req: Request<String>| {
                    let body = req.body().as_str();
                    base.clone()
                        .emit_signal("ipc_message", &[body.to_variant()]);
                });

            if !self.user_agent.is_empty() {
                builder = builder.with_user_agent(&self.user_agent.to_string());
            }

            if self.html.is_empty() && !self.url.is_empty() {
                builder = builder.with_url(&self.url.to_string());
            } else if !self.html.is_empty() && self.url.is_empty() {
                builder = builder.with_html(&self.html.to_string());
            }

            let webview_builder = builder;

            if !self.url.is_empty() && !self.html.is_empty() {
                godot_error!(
                    "[GodotBrowser] You have entered both a URL and HTML code. Only one can be used."
                );
                return;
            }

            match webview_builder.build_as_child(&window) {
                Ok(webview) => {
                    self.webview.replace(webview);
                    self.resize();
                }
                Err(e) => {
                    godot_error!("[GodotBrowser] Failed to create WebView: {:?}", e);
                }
            }
        }
    }
}

#[godot_api]
impl GodotBrowser {
    #[signal]
    fn ipc_message(message: GString);

    #[func]
    pub fn is_initialized(&self) -> bool {
        self.webview.is_some()
    }

    #[func]
    fn post_message(&self, message: GString) {
        if let Some(webview) = &self.webview {
            let escaped_message = message.to_string().replace("'", "\\'");
            let script = format!(
                "document.dispatchEvent(new CustomEvent('message', {{ detail: '{}' }}))",
                escaped_message
            );
            let _ = webview.evaluate_script(&script);
        }
    }

    #[func]
    pub fn resize(&self) {
        if let Some(webview) = &self.webview {
            let rect = {
                let viewport_size = self
                    .base()
                    .get_tree()
                    .and_then(|tree| tree.get_root())
                    .map(|viewport| viewport.get_size())
                    .unwrap_or(Vector2i::new(800, 600));

                Rect {
                    position: PhysicalPosition::new(0, 0).into(),
                    size: PhysicalSize::new(viewport_size.x as u32, viewport_size.y as u32).into(),
                }
            };
            if let Err(e) = webview.set_bounds(rect) {
                godot_error!("[GodotBrowser] Failed to resize WebView: {:?}", e);
            } else {
                godot_print!("[GodotBrowser] WebView resized to {:?}.", rect.size);
            }
        }
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn get_res_response(request: Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    let os = Os::singleton();
    let root = if os.has_feature("editor") {
        let project_settings = ProjectSettings::singleton();
        PathBuf::from(String::from(project_settings.globalize_path("res://")))
    } else {
        let mut dir = PathBuf::from(String::from(os.get_executable_path()));
        dir.pop();
        dir
    };

    let path = format!(
        "{}{}",
        request.uri().host().unwrap_or_default(),
        request.uri().path()
    );
    let full_path = root.join(path);
    if full_path.exists() && full_path.is_file() {
        let content = fs::read(full_path).expect("Failed to read file");
        let mime = infer::get(&content).expect("File type is unknown");
        return http::Response::builder()
            .header(CONTENT_TYPE, mime.to_string())
            .status(200)
            .body(content)
            .unwrap()
            .map(Into::into);
    }

    http::Response::builder()
        .header(CONTENT_TYPE, "text/plain")
        .status(404)
        .body(
            format!("Could not find file at {:?}", full_path)
                .as_bytes()
                .to_vec(),
        )
        .unwrap()
        .map(Into::into)
}
