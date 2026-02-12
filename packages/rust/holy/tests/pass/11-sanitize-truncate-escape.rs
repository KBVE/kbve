use holy::Sanitize;

#[derive(Sanitize)]
pub struct Comment {
	#[holy(sanitize = "truncate(5)")]
	pub title: String,
	#[holy(sanitize = "escape_html")]
	pub body: String,
}

fn main() {
	let mut c = Comment {
		title: "Hello World".into(),
		body: "<b>Hello</b> & \"world\"".into(),
	};
	c.sanitize();
	assert_eq!(c.title, "Hello");
	assert_eq!(c.body, "&lt;b&gt;Hello&lt;/b&gt; &amp; &quot;world&quot;");
}
