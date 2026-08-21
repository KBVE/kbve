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

/// The ingest service rejects a batch larger than its `METRICS_MAX_BATCH`
/// (default 50) with a 413 — the whole batch, not the excess — and this client
/// drops what it has already taken from the queue. The queue can reach
/// `MAX_QUEUE` while a request is in flight, so without a chunk smaller than the
/// server's cap the first error storm posts 64 events, gets a 413, and loses all
/// of them. Kept well under 50 so raising the queue never silently re-crosses it.
const MAX_PER_POST: usize = 32;

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
    /// Free-form dimensions the service keeps but does not fingerprint on, so
    /// they can be filtered without splitting an error into one group per
    /// machine. The renderer and adapter live here: a failure that only happens
    /// on one graphics backend is invisible otherwise, since `platform` collapses
    /// every desktop OS into one value.
    extra: std::collections::BTreeMap<String, String>,
}

#[derive(Serialize)]
struct ErrorBatch {
    events: Vec<ErrorEvent>,
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

/// What the client is drawing with. Collected once, attached to every event.
///
/// `platform` is limited to the ingest service's allow-list, which folds Windows,
/// macOS and Linux into "desktop", so without this a backend-specific failure —
/// the shape of the tree field not loading on one OS and not another — reads as
/// the same error everywhere and there is nothing to filter on.
fn collect_device() -> std::collections::BTreeMap<String, String> {
    let mut out = std::collections::BTreeMap::new();
    let os = Os::singleton();
    out.insert("os".to_string(), os.get_name().to_string());
    out.insert("os_version".to_string(), os.get_version().to_string());
    let rs = godot::classes::RenderingServer::singleton();
    out.insert(
        "adapter".to_string(),
        rs.get_video_adapter_name().to_string(),
    );
    out.insert(
        "renderer".to_string(),
        ProjectSettings::singleton()
            .get_setting("rendering/renderer/rendering_method")
            .try_to::<GString>()
            .map(|v| v.to_string())
            .unwrap_or_default(),
    );
    out
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
    device: std::collections::BTreeMap<String, String>,
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
            device: std::collections::BTreeMap::new(),
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

        self.device = collect_device();

        crate::telemetry::install_panic_hook();
    }

    fn process(&mut self, delta: f64) {
        self.drain_reports();
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
        // Drained, not taken: anything beyond one post's worth stays queued and
        // goes out on the next flush rather than being thrown away.
        let take = self.queue.len().min(MAX_PER_POST);
        let batch = ErrorBatch {
            events: self.queue.drain(..take).collect(),
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
        _body: PackedByteArray,
    ) {
        self.in_flight = false;
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
            extra: self.device.clone(),
        });
    }

    fn drain_reports(&mut self) {
        for report in crate::telemetry::drain() {
            self.push(
                report.error_type,
                report.message,
                report.stack,
                report.handled,
            );
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

#[cfg(test)]
mod tests {
    use super::{MAX_PER_POST, MAX_QUEUE};

    /// The ingest service's default `METRICS_MAX_BATCH`, which the deployment does
    /// not override. Duplicated as a literal because the service is a separate
    /// crate this one must not depend on — so the coupling is asserted here
    /// instead of being left to whoever next raises a constant.
    const SERVICE_MAX_BATCH: usize = 50;

    #[test]
    fn a_post_never_exceeds_the_services_batch_cap() {
        assert!(
            MAX_PER_POST <= SERVICE_MAX_BATCH,
            "a batch over the service cap is rejected whole, and this client drops \
             what it has already dequeued — every event in it is lost"
        );
    }

    #[test]
    fn a_full_queue_takes_more_than_one_post_to_drain() {
        // The queue is allowed to outgrow one post; that is the case the chunking
        // exists for. If these ever became equal, chunking would be untested.
        assert!(MAX_QUEUE > MAX_PER_POST);
    }
}
