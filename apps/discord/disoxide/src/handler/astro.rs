use askama::Template;
use axum::{http::StatusCode, response::{Html, IntoResponse}};
use crate::entity::state::SharedState;
use axum::extract::Path;
use jedi::{envelope::EnvelopePipeline, wrapper::RedisEnvelope};
use std::borrow::Cow;
use jedi::{
    proto::jedi::{MessageKind, PayloadFormat},
    entity::envelope::{wrap_hybrid, try_unwrap_payload},
  };

#[derive(Template)]
#[template(path = "../dist/askama/index.html")]
pub struct AstroTemplate<'a> {
    content: &'a str,
    path: &'a str,
    title: &'a str,
    description: &'a str,
}

impl<'a> AstroTemplate<'a> {
    pub fn new(content: &'a str, path: &'a str, title: &'a str, description: &'a str) -> Self {
        Self { content, path, title, description}
    }
}


#[inline]
fn sanitize_key(path: &str) -> Option<Cow<'_, str>> {
    if path.bytes().all(|b| b.is_ascii_alphanumeric()) {
        Some(Cow::Borrowed(path))
    } else {
        let mut result = String::with_capacity(path.len());
        for b in path.bytes() {
            if b.is_ascii_alphanumeric() {
                result.push(b as char);
            }
        }

        if result.is_empty() {
            None
        } else {
            Some(Cow::Owned(result))
        }
    }
}

async fn get_content(state: &SharedState, path: &str) -> String {
    let Some(key) = sanitize_key(path) else {
        return "(400) Invalid path".to_string();
    };

    let payload = serde_json::json!({ "key": key });
    let kind = MessageKind::Redis as i32 | MessageKind::Get as i32;
    let envelope = wrap_hybrid(kind, PayloadFormat::Json, &payload, None);

    match envelope.process(&state.temple).await {
        Ok(env) => {
            #[derive(serde::Deserialize)]
            struct RedisResult {
                key: String,
                value: Option<String>,
            }

            match try_unwrap_payload::<RedisResult>(&env) {
                Ok(data) => data.value.unwrap_or_else(|| "(404) Key found, but value is empty".into()),
                Err(_) => "(500) Failed to decode Redis response".into(),
            }
        }
        Err(_) => format!("(404) No content found for '{}'", path),
    }
}

fn render_template<T: Template>(template: T) -> Result<Html<String>, StatusCode> {
    template
        .render()
        .map(Html)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}


pub async fn home_handler(state: axum::extract::State<SharedState>) -> Result<Html<String>, StatusCode> {
    let template = AstroTemplate::new("Hello from Astro + Rust!", "/askama", "Discord.sh Askama", "Discord.sh Page for Askama");
    template
        .render()
        .map(Html)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn catch_all_handler(
    state: axum::extract::State<SharedState>,
    Path(path): Path<String>,
) -> impl IntoResponse {
    let content = get_content(&state, &path).await;
    let title: Cow<str> = if path.is_empty() {
        Cow::Borrowed("Discord.SH")
    } else {
        Cow::Owned(format!("Discord.SH {}", path))
    };
    
    let description: Cow<str> = if path.is_empty() {
        Cow::Borrowed("Discord.SH Page About")
    } else {
        Cow::Owned(format!("Discord.SH Page About {}", path))
    };
    let template = AstroTemplate::new(&content, &path, &title, &description);
    render_template(template)
}

pub fn astro_router() -> axum::Router<SharedState> {
    axum::Router::new()
        .route("/askama", axum::routing::get(home_handler))
        .route("/{*wildcard}", axum::routing::get(catch_all_handler))
}

