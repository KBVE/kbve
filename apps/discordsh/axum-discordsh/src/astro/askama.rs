use askama::Template;
use axum::{
    http::StatusCode,
    response::{Html, IntoResponse, Response},
};

#[derive(Template)]
#[template(path = "askama/index.html")]
pub struct AstroTemplate<'a> {
    pub content: &'a str,
    pub path: &'a str,
    pub title: &'a str,
    pub description: &'a str,
}

impl<'a> AstroTemplate<'a> {
    pub fn new(content: &'a str, path: &'a str, title: &'a str, description: &'a str) -> Self {
        Self {
            content,
            path,
            title,
            description,
        }
    }
}

pub struct TemplateResponse<T: Template>(pub T);

impl<T: Template> IntoResponse for TemplateResponse<T> {
    fn into_response(self) -> Response {
        match self.0.render() {
            Ok(html) => Html(html).into_response(),
            Err(err) => {
                tracing::error!(error = %err, "template rendering failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to render template",
                )
                    .into_response()
            }
        }
    }
}

pub async fn fallback_handler() -> Response {
    let template = AstroTemplate::new(
        "<h1>Page Not Found</h1><p>The requested page does not exist.</p>",
        "/404",
        "404 - Not Found",
        "Page not found",
    );
    (StatusCode::NOT_FOUND, TemplateResponse(template)).into_response()
}
