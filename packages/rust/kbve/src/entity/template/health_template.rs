use askama::Template;

#[derive(Template)]
#[template(path = "askama/health.html")]
pub struct HealthTemplate {
    pub status: String,
    pub version: String,
    pub uptime_seconds: u64,
}
