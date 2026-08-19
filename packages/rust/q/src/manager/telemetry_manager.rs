use std::backtrace::Backtrace;
use std::panic;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use godot::classes::http_client::Method;
use godot::classes::notify::NodeNotification;
use godot::classes::{Engine, HttpRequest, Node, Os, ProjectSettings};
use godot::global::Error as GodotError;
use godot::prelude::*;
use serde::Serialize;

const ENDPOINT: &str = "https://metrics.kbve.com/api/v1/ingest/errors";
const PROJECT: &str = "friendslop";

const MAX_QUEUE: usize = 64;
const FLUSH_AT: usize = 8;
const FLUSH_EVERY: f64 = 15.0;

/// Panics are caught by a hook that can run on any thread, including one with no
/// Godot bindings, so nothing in the hook may touch a `Gd<T>`. It parks the
/// record here and the node drains it from `process` on the main thread.
static PANICS: OnceLock<Mutex<Vec<PanicRecord>>> = OnceLock::new();
static HOOK: OnceLock<()> = OnceLock::new();

struct PanicRecord {
    message: String,
    location: String,
    stack: String,
}

fn panic_sink() -> &'static Mutex<Vec<PanicRecord>> {
    PANICS.get_or_init(|| Mutex::new(Vec::new()))
}

fn install_hook() {
    HOOK.get_or_init(|| {
        let previous = panic::take_hook();
        panic::set_hook(Box::new(move |info| {
            let message = info
                .payload()
                .downcast_ref::<&str>()
                .map(|s| (*s).to_string())
                .or_else(|| info.payload().downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "panic".to_string());
            let location = info
                .location()
                .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
                .unwrap_or_default();
            let stack = Backtrace::force_capture().to_string();
            if let Ok(mut queue) = panic_sink().lock()
                && queue.len() < MAX_QUEUE
            {
                queue.push(PanicRecord {
                    message,
                    location,
                    stack,
                });
            }
            // Chained rather than replaced: gdext's own hook is what turns a panic
            // into a readable Godot error instead of an abort, and dropping it
            // would trade a crash report for a silent process death.
            previous(info);
        }));
    });
}

#[derive(Serialize)]
struct ErrorEvent {
    project: String,
    platform: String,
    release: String,
    environment: String,
    error_type: String,
    message: String,
    stack: String,
    url: String,
    session_id: String,
    handled: bool,
}

#[derive(Serialize)]
struct ErrorBatch {
    events: Vec<ErrorEvent>,
}

#[derive(serde::Deserialize)]
struct IngestReply {
    accepted: u64,
    dropped: u64,
}

/// Maps to the ingest service's `PLATFORMS` allow-list. Anything outside it is
/// rewritten to `unknown` server-side, which loses the dimension entirely, so the
/// mapping happens here where the real OS name is still available.
fn platform_for(os_name: &str) -> &'static str {
    match os_name {
        "Android" => "android",
        "iOS" => "ios",
        "Web" => "web",
        _ => "desktop",
    }
}

#[derive(GodotClass)]
#[class(base = Node)]
pub struct TelemetryManager {
    base: Base<Node>,
    http: Option<Gd<HttpRequest>>,
    queue: Vec<ErrorEvent>,
    in_flight: bool,
    since_flush: f64,
    enabled: bool,
    endpoint: String,
    project: String,
    release: String,
    environment: String,
    platform: String,
    session_id: String,
    scene: String,
}

#[godot_api]
impl INode for TelemetryManager {
    fn init(base: Base<Node>) -> Self {
        TelemetryManager {
            base,
            http: None,
            queue: Vec::new(),
            in_flight: false,
            since_flush: 0.0,
            enabled: true,
            endpoint: ENDPOINT.to_string(),
            project: PROJECT.to_string(),
            release: String::new(),
            environment: String::new(),
            platform: String::new(),
            session_id: String::new(),
            scene: String::new(),
        }
    }

    fn ready(&mut self) {
        let settings = ProjectSettings::singleton();
        if self.release.is_empty() {
            self.release = settings
                .get_setting("application/config/version")
                .try_to::<GString>()
                .map(|v| v.to_string())
                .unwrap_or_else(|_| "dev".to_string());
        }
        if self.environment.is_empty() {
            self.environment = if Engine::singleton().is_editor_hint() {
                "development".to_string()
            } else {
                "production".to_string()
            };
        }
        if self.platform.is_empty() {
            self.platform = platform_for(&Os::singleton().get_name().to_string()).to_string();
        }
        if self.session_id.is_empty() {
            self.session_id = new_session_id();
        }

        let mut http = HttpRequest::new_alloc();
        http.set_name("TelemetryTransport");
        let done = self.base().callable("_on_request_completed");
        http.connect("request_completed", &done);
        self.base_mut().add_child(&http);
        self.http = Some(http);

        install_hook();
    }

    fn process(&mut self, delta: f64) {
        self.drain_panics();
        if self.queue.is_empty() {
            return;
        }
        self.since_flush += delta;
        if self.queue.len() >= FLUSH_AT || self.since_flush >= FLUSH_EVERY {
            self.flush();
        }
    }

    fn on_notification(&mut self, what: NodeNotification) {
        // A quit is the one moment the batch will never be flushed by the timer,
        // and it is also when the interesting errors have just happened.
        if matches!(
            what,
            NodeNotification::WM_CLOSE_REQUEST | NodeNotification::PREDELETE
        ) {
            self.flush();
        }
    }
}

#[godot_api]
impl TelemetryManager {
    /// Overrides any of the auto-detected fields. Every argument is optional in
    /// the sense that an empty string leaves the detected value alone.
    #[func]
    fn configure(&mut self, project: GString, release: GString, environment: GString) {
        let project = project.to_string();
        if !project.is_empty() {
            self.project = project;
        }
        let release = release.to_string();
        if !release.is_empty() {
            self.release = release;
        }
        let environment = environment.to_string();
        if !environment.is_empty() {
            self.environment = environment;
        }
    }

    #[func]
    fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }

    /// The logical location an error happened in — a scene or level name. The
    /// ingest service treats it as a filter dimension, not part of the grouping
    /// fingerprint, so changing it never splits an existing error group.
    #[func]
    fn set_scene(&mut self, scene: GString) {
        self.scene = scene.to_string();
    }

    #[func]
    fn get_session_id(&self) -> GString {
        GString::from(&self.session_id)
    }

    #[func]
    fn report(&mut self, error_type: GString, message: GString, stack: GString) {
        self.push(
            error_type.to_string(),
            message.to_string(),
            stack.to_string(),
            true,
        );
    }

    #[func]
    fn report_unhandled(&mut self, error_type: GString, message: GString, stack: GString) {
        self.push(
            error_type.to_string(),
            message.to_string(),
            stack.to_string(),
            false,
        );
    }

    #[func]
    fn flush(&mut self) {
        if self.in_flight || self.queue.is_empty() {
            return;
        }
        let Some(http) = self.http.clone() else {
            return;
        };
        let batch = ErrorBatch {
            events: std::mem::take(&mut self.queue),
        };
        let Ok(body) = serde_json::to_string(&batch) else {
            return;
        };
        self.since_flush = 0.0;

        let headers = PackedStringArray::from(&[GString::from("Content-Type: application/json")]);
        let mut http = http;
        let result = http
            .request_ex(&self.endpoint)
            .custom_headers(&headers)
            .method(Method::POST)
            .request_data(&GString::from(&body))
            .done();
        if result == GodotError::OK {
            self.in_flight = true;
        }
        // A refused request is dropped rather than requeued: the events are
        // already gone from the queue, and holding a failed batch forever is how
        // a telemetry client turns one outage into unbounded memory growth.
    }

    #[func]
    fn _on_request_completed(
        &mut self,
        _result: i32,
        response_code: i32,
        _headers: PackedStringArray,
        body: PackedByteArray,
    ) {
        self.in_flight = false;
        // The service answers 202 with {"accepted":N,"dropped":M} and drops
        // sanitized-away events silently — an empty message returns 202 with
        // accepted:0, so a client that only checks the status code believes it
        // reported something it did not. Surfaced here instead.
        if (200..300).contains(&response_code) {
            if let Ok(text) = std::str::from_utf8(body.as_slice())
                && let Ok(reply) = serde_json::from_str::<IngestReply>(text)
                && reply.dropped > 0
            {
                godot_warn!(
                    "telemetry ingest dropped {} of {} events",
                    reply.dropped,
                    reply.dropped + reply.accepted
                );
            }
            return;
        }
        if response_code >= 400 {
            // godot_warn, not report: a failed telemetry post must never become
            // an event that triggers another telemetry post.
            godot_warn!("telemetry ingest returned {}", response_code);
        }
    }
}

impl TelemetryManager {
    fn push(&mut self, error_type: String, message: String, stack: String, handled: bool) {
        if !self.enabled || message.is_empty() {
            return;
        }
        if self.queue.len() >= MAX_QUEUE {
            return;
        }
        self.queue.push(ErrorEvent {
            project: self.project.clone(),
            platform: self.platform.clone(),
            release: self.release.clone(),
            environment: self.environment.clone(),
            error_type,
            message,
            stack,
            url: self.scene.clone(),
            session_id: self.session_id.clone(),
            handled,
        });
    }

    fn drain_panics(&mut self) {
        let records: Vec<PanicRecord> = match panic_sink().lock() {
            Ok(mut queue) => {
                if queue.is_empty() {
                    return;
                }
                std::mem::take(&mut *queue)
            }
            Err(_) => return,
        };
        for record in records {
            let message = if record.location.is_empty() {
                record.message
            } else {
                format!("{} ({})", record.message, record.location)
            };
            self.push("RustPanic".to_string(), message, record.stack, false);
        }
    }
}

fn new_session_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id() as u128;
    format!("{:032x}", nanos ^ (pid << 64))
}
