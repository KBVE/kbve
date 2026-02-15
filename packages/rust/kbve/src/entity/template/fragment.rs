use askama::Template;

#[derive(Template, Clone, Debug)]
#[template(path = "askama/fragments/card.html")]
pub struct CardFragment {
    pub title: String,
    pub subtitle: Option<String>,
    pub body: Option<String>,
    pub href: Option<String>,
    pub link_text: Option<String>,
}

#[derive(Template, Clone, Debug)]
#[template(path = "askama/fragments/hero.html")]
pub struct HeroFragment {
    pub title: String,
    pub subtitle: Option<String>,
    pub cta_text: Option<String>,
    pub cta_href: Option<String>,
}

#[derive(Template, Clone, Debug)]
#[template(path = "askama/fragments/alert.html")]
pub struct AlertFragment {
    pub variant: String,
    pub message: String,
}

#[derive(Template, Clone, Debug)]
#[template(path = "askama/fragments/section.html")]
pub struct SectionFragment {
    pub title: String,
    pub subtitle: Option<String>,
    pub body: Option<String>,
}

#[derive(Template, Clone, Debug)]
#[template(path = "askama/fragments/stat.html")]
pub struct StatFragment {
    pub value: String,
    pub label: String,
    pub description: Option<String>,
}

/// Render any Askama template to a raw HTML string.
pub fn render_fragment<T: Template>(template: &T) -> Result<String, askama::Error> {
    template.render()
}
