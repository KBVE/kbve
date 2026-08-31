use askama::Template;

#[derive(Template)]
#[template(path = "askama/index.html")]
pub struct IndexTemplate {
    pub title: String,
    pub description: String,
    pub content: String,
    pub path: String,
}
