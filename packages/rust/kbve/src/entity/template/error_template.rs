use askama::Template;

#[derive(Template)]
#[template(path = "askama/error.html")]
pub struct ErrorTemplate {
    pub code: u16,
    pub message: String,
}
