use godot::prelude::*;
use godot::classes::{
  Control,
  IControl,
  IDisplayServer,
  DisplayServer,
  ISprite2D,
  Os,
  ProjectSettings,
  Sprite2D,
  display_server::HandleType,
};

#[cfg(target_os = "macos")]
use crate::macos::macos_wry_browser_options::MacOSWryBrowserOptions;
#[cfg(target_os = "windows")]
use crate::windows::windows_wry_browser_options::WindowsWryBrowserOptions;

#[cfg(any(target_os = "macos", target_os = "windows"))]
use raw_window_handle::{ HasWindowHandle, WindowHandle, HandleError };

#[cfg(any(target_os = "macos", target_os = "windows"))]
use wry::{
  dpi::{ LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize },
  http::{ HeaderMap, Request },
  WebView,
  WebViewBuilder,
  Rect,
  WebViewAttributes,
  RGBA,
};

#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::{ borrow::Cow, fs, thread, path::PathBuf };

#[cfg(any(target_os = "macos", target_os = "windows"))]
use http::{ header::CONTENT_TYPE, Response };

#[derive(GodotClass)]
#[class(base = Control)]
pub struct GodotBrowser {
  base: Base<Control>,

  #[cfg(any(target_os = "macos", target_os = "windows"))]
  webview: Option<WebView>,

  #[cfg(target_os = "macos")]
  inner: MacOSWryBrowserOptions,

  #[cfg(target_os = "windows")]
  inner: WindowsWryBrowserOptions,

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

      #[cfg(target_os = "macos")]
      inner: MacOSWryBrowserOptions {},

      #[cfg(target_os = "windows")]
      inner: WindowsWryBrowserOptions {},

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


    godot_print!("[GodotBrowser] WRY EXT Processing...");
      let window_handle = match self.inner.window_handle() {
        Ok(handle) => handle,
        Err(e) => {
            godot_error!("[GodotBrowser] Failed to get window handle: {:?}", e);
            return;
        }
    };


    godot_print!("[GodotBrowser] WRY Got Inner");
      let base = self.base().clone();
      let webview_builder = WebViewBuilder::with_attributes(WebViewAttributes {
        url: if self.html.is_empty() {
          Some(self.url.to_string())
        } else {
          None
        },
        html: if self.url.is_empty() {
          Some(self.html.to_string())
        } else {
          None
        },
        transparent: self.transparent,
        devtools: self.devtools,
        user_agent: Some(self.user_agent.to_string()),
        zoom_hotkeys_enabled: self.zoom_hotkeys,
        clipboard: self.clipboard,
        incognito: self.incognito,
        focused: self.focused,
        ..Default::default()
      })
        .with_ipc_handler(move |req: Request<String>| {
          let body = req.body().as_str();
          base.clone().emit_signal("ipc_message", &[body.to_variant()]);
        })
        .with_custom_protocol("res".into(), move |_webview_id, request| get_res_response(request));


    godot_print!("[GodotBrowser] Attempting to create WebView...");

      if !self.url.is_empty() && !self.html.is_empty() {
        godot_error!(
          "[GodotBrowser] You have entered both a URL and HTML code. Only one can be used."
        );
        return;
      }

      match webview_builder.build_as_child(&window_handle) {
        Ok(webview) => {
          self.webview.replace(webview);
          godot_print!("[GodotBrowser] WebView successfully initialized.");
          if
            let Some(mut viewport) = self
              .base()
              .get_tree()
              .and_then(|tree| tree.get_root())
          {
            viewport.connect("size_changed", &Callable::from_object_method(&*self.base(), "resize"));
          }
        }
        Err(e) => {
          godot_error!("[GodotBrowser] Failed to create WebView: {:?}", e);
          godot_print!("[GodotBrowser] Debug Info - URL: {:?}, Transparent: {}, DevTools: {}, UserAgent: {:?}",
          self.url, self.transparent, self.devtools, self.user_agent);
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
      let script =
        format!("document.dispatchEvent(new CustomEvent('message', {{ detail: '{}' }}))", escaped_message);
      let _ = webview.evaluate_script(&script);
    }
  }

  #[func]
  fn resize(&self) {
    if let Some(webview) = &self.webview {
      let rect = if self.full_window_size {
        let viewport_size = self
          .base()
          .get_tree()
          .and_then(|tree| tree.get_root())
          .map(|root| root.get_size())
          .unwrap_or_default();
        Rect {
          position: PhysicalPosition::new(0, 0).into(),
          size: PhysicalSize::new(viewport_size.x, viewport_size.y).into(),
        }
      } else {
        let rect = self.base().get_global_rect();
        Rect {
          position: PhysicalPosition::new(rect.position.x, rect.position.y).into(),
          size: PhysicalSize::new(rect.size.x, rect.size.y).into(),
        }
      };
      let _ = webview.set_bounds(rect);
    }
  }
}

impl HasWindowHandle for GodotBrowser {
  fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
    #[cfg(target_os = "macos")]
    {
      return self.inner.window_handle();
    }

    #[cfg(target_os = "windows")]
    {
      return self.inner.window_handle();
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
      Err(HandleError::NotSupported)
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

  let path = format!("{}{}", request.uri().host().unwrap_or_default(), request.uri().path());
  let full_path = root.join(path);
  if full_path.exists() && full_path.is_file() {
    let content = fs::read(full_path).expect("Failed to read file");
    let mime = infer::get(&content).expect("File type is unknown");
    return http::Response
      ::builder()
      .header(CONTENT_TYPE, mime.to_string())
      .status(200)
      .body(content)
      .unwrap()
      .map(Into::into);
  }

  http::Response
    ::builder()
    .header(CONTENT_TYPE, "text/plain")
    .status(404)
    .body(format!("Could not find file at {:?}", full_path).as_bytes().to_vec())
    .unwrap()
    .map(Into::into)
}
