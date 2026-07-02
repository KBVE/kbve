use dashmap::DashMap;
use serde::Serialize;
use std::hash::{Hash, Hasher};
use std::time::{Duration, Instant};
use tracing::field::{Field, Visit};
use tracing_subscriber::layer::Context;

const BATCH_SIZE: usize = 32;
const FLUSH_INTERVAL: Duration = Duration::from_secs(5);
const CHANNEL_CAPACITY: usize = 1024;
const THROTTLE_MAX_PER_WINDOW: u64 = 10;
const THROTTLE_WINDOW: Duration = Duration::from_secs(60);

#[derive(Clone, Debug)]
pub struct ObservConfig {
    pub endpoint: String,
    pub project: String,
    pub environment: String,
    pub release: Option<String>,
}

impl ObservConfig {
    pub fn from_env() -> Option<Self> {
        Self::from_parts(
            std::env::var("OBSERV_ENDPOINT").ok(),
            std::env::var("OBSERV_PROJECT").ok(),
            std::env::var("OBSERV_ENVIRONMENT").ok(),
            std::env::var("OBSERV_RELEASE").ok(),
        )
    }

    pub fn from_parts(
        endpoint: Option<String>,
        project: Option<String>,
        environment: Option<String>,
        release: Option<String>,
    ) -> Option<Self> {
        let endpoint = endpoint.filter(|e| !e.is_empty())?;
        Some(Self {
            endpoint,
            project: project
                .filter(|p| !p.is_empty())
                .unwrap_or_else(|| "unknown".into()),
            environment: environment
                .filter(|e| !e.is_empty())
                .unwrap_or_else(|| "production".into()),
            release: release.filter(|r| !r.is_empty()),
        })
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct ObservEvent {
    pub project: String,
    pub platform: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release: Option<String>,
    pub environment: String,
    pub error_type: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    pub handled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

pub struct Allow {
    pub allowed: bool,
    pub suppressed: u64,
}

pub struct Throttle {
    max: u64,
    window: Duration,
    slots: DashMap<u64, (Instant, u64, u64)>,
}

impl Throttle {
    pub fn new(max: u64, window: Duration) -> Self {
        Self {
            max,
            window,
            slots: DashMap::new(),
        }
    }

    pub fn allow(&self, callsite: u64) -> Allow {
        let now = Instant::now();
        let mut entry = self.slots.entry(callsite).or_insert((now, 0, 0));
        let (start, count, suppressed) = *entry;
        if count > 0 && now.duration_since(start) >= self.window {
            *entry = (now, 1, 0);
            return Allow {
                allowed: true,
                suppressed,
            };
        }
        if count < self.max {
            *entry = (start, count + 1, suppressed);
            Allow {
                allowed: true,
                suppressed: 0,
            }
        } else {
            *entry = (start, count, suppressed + 1);
            Allow {
                allowed: false,
                suppressed: 0,
            }
        }
    }
}

#[derive(Clone)]
struct Sender {
    tx: tokio::sync::mpsc::Sender<ObservEvent>,
}

impl Sender {
    fn enqueue(&self, event: ObservEvent) {
        let _ = self.tx.try_send(event);
    }
}

async fn run_flusher(endpoint: String, mut rx: tokio::sync::mpsc::Receiver<ObservEvent>) {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            tracing::debug!(target: "jedi::observ", error = %e, "reqwest client build failed");
            return;
        }
    };
    let mut buffer: Vec<ObservEvent> = Vec::with_capacity(BATCH_SIZE);
    let mut tick = tokio::time::interval(FLUSH_INTERVAL);
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            received = rx.recv() => {
                match received {
                    Some(event) => {
                        buffer.push(event);
                        if buffer.len() >= BATCH_SIZE {
                            flush(&client, &endpoint, &mut buffer).await;
                        }
                    }
                    None => {
                        flush(&client, &endpoint, &mut buffer).await;
                        return;
                    }
                }
            }
            _ = tick.tick() => {
                flush(&client, &endpoint, &mut buffer).await;
            }
        }
    }
}

async fn flush(client: &reqwest::Client, endpoint: &str, buffer: &mut Vec<ObservEvent>) {
    if buffer.is_empty() {
        return;
    }
    let events: Vec<ObservEvent> = buffer.drain(..).collect();
    let body = serde_json::json!({ "events": events });
    if let Err(e) = client.post(endpoint).json(&body).send().await {
        tracing::debug!(target: "jedi::observ", error = %e, "telemetry flush failed");
    }
}

pub struct ObservLayer {
    cfg: ObservConfig,
    sender: Sender,
    throttle: Throttle,
}

#[derive(Default)]
struct MessageVisitor {
    message: String,
    fields: Vec<(String, String)>,
}

impl Visit for MessageVisitor {
    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        if field.name() == "message" {
            self.message = format!("{value:?}");
        } else {
            self.fields.push((field.name().into(), format!("{value:?}")));
        }
    }
}

impl MessageVisitor {
    fn render(self) -> String {
        if self.fields.is_empty() {
            return self.message;
        }
        let rest: Vec<String> = self
            .fields
            .into_iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect();
        if self.message.is_empty() {
            rest.join(" ")
        } else {
            format!("{} {}", self.message, rest.join(" "))
        }
    }
}

fn callsite_hash(id: tracing::callsite::Identifier) -> u64 {
    let mut hasher = std::hash::DefaultHasher::new();
    id.hash(&mut hasher);
    hasher.finish()
}

impl ObservLayer {
    fn build_event(
        &self,
        meta: &tracing::Metadata<'_>,
        message: String,
        suppressed: u64,
        level: &tracing::Level,
    ) -> ObservEvent {
        let mut extra = serde_json::Map::new();
        extra.insert(
            "level".into(),
            serde_json::Value::String(level.as_str().to_lowercase()),
        );
        if suppressed > 0 {
            extra.insert("suppressed".into(), serde_json::Value::from(suppressed));
        }
        ObservEvent {
            project: self.cfg.project.clone(),
            platform: "server".into(),
            release: self.cfg.release.clone(),
            environment: self.cfg.environment.clone(),
            error_type: meta.target().to_string(),
            message,
            url: Some(format!(
                "{}::{}:{}",
                meta.target(),
                meta.file().unwrap_or("?"),
                meta.line().unwrap_or(0)
            )),
            handled: true,
            extra: Some(serde_json::Value::Object(extra)),
        }
    }
}

impl<S: tracing::Subscriber> tracing_subscriber::Layer<S> for ObservLayer {
    fn on_event(&self, event: &tracing::Event<'_>, _ctx: Context<'_, S>) {
        let meta = event.metadata();
        if *meta.level() > tracing::Level::WARN || meta.target().starts_with("jedi::observ") {
            return;
        }
        let verdict = self.throttle.allow(callsite_hash(meta.callsite()));
        if !verdict.allowed {
            return;
        }
        let mut visitor = MessageVisitor::default();
        event.record(&mut visitor);
        self.sender.enqueue(self.build_event(
            meta,
            visitor.render(),
            verdict.suppressed,
            meta.level(),
        ));
    }
}

pub fn init(cfg: Option<ObservConfig>) -> Option<ObservLayer> {
    let cfg = cfg?;
    let (tx, rx) = tokio::sync::mpsc::channel(CHANNEL_CAPACITY);
    tokio::spawn(run_flusher(cfg.endpoint.clone(), rx));
    let sender = Sender { tx };
    install_panic_hook(cfg.clone(), sender.clone());
    Some(ObservLayer {
        cfg,
        sender,
        throttle: Throttle::new(THROTTLE_MAX_PER_WINDOW, THROTTLE_WINDOW),
    })
}

fn install_panic_hook(cfg: ObservConfig, sender: Sender) {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "panic".into());
        let url = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()));
        sender.enqueue(ObservEvent {
            project: cfg.project.clone(),
            platform: "server".into(),
            release: cfg.release.clone(),
            environment: cfg.environment.clone(),
            error_type: "panic".into(),
            message,
            url,
            handled: false,
            extra: None,
        });
        prev(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_none_without_endpoint() {
        assert!(ObservConfig::from_parts(None, None, None, None).is_none());
        assert!(ObservConfig::from_parts(Some(String::new()), None, None, None).is_none());
    }

    #[test]
    fn config_defaults() {
        let c = ObservConfig::from_parts(
            Some("http://m:5500/api/v1/ingest/errors".into()),
            Some("arpg".into()),
            None,
            None,
        )
        .unwrap();
        assert_eq!(c.project, "arpg");
        assert_eq!(c.environment, "production");
        assert!(c.release.is_none());
    }

    #[test]
    fn throttle_allows_then_suppresses() {
        let t = Throttle::new(3, Duration::from_secs(60));
        for _ in 0..3 {
            assert!(t.allow(1).allowed);
        }
        let v = t.allow(1);
        assert!(!v.allowed);
        assert!(t.allow(2).allowed);
    }

    #[test]
    fn throttle_reports_suppressed_after_window() {
        let t = Throttle::new(1, Duration::from_millis(1));
        assert!(t.allow(1).allowed);
        assert!(!t.allow(1).allowed);
        std::thread::sleep(Duration::from_millis(5));
        let v = t.allow(1);
        assert!(v.allowed);
        assert_eq!(v.suppressed, 1);
    }

    #[test]
    fn event_serializes_wire_shape() {
        let e = ObservEvent {
            project: "arpg".into(),
            platform: "server".into(),
            release: None,
            environment: "production".into(),
            error_type: "arpg_server::game".into(),
            message: "boom".into(),
            url: Some("arpg_server::game::src/game.rs:42".into()),
            handled: true,
            extra: None,
        };
        let v = serde_json::to_value(&e).unwrap();
        assert_eq!(v["project"], "arpg");
        assert_eq!(v["platform"], "server");
        assert!(v.get("release").is_none());
    }

    #[tokio::test]
    async fn init_none_when_unconfigured() {
        assert!(init(None).is_none());
    }

    #[tokio::test]
    async fn layer_composes_with_registry() {
        use tracing_subscriber::prelude::*;
        let cfg = ObservConfig::from_parts(
            Some("http://127.0.0.1:1/x".into()),
            Some("t".into()),
            None,
            None,
        );
        let layer = init(cfg).unwrap();
        let _sub = tracing_subscriber::registry().with(layer);
    }
}
