//! Social meta tag builder using `Cow<str>` to avoid allocations
//! for static values while supporting dynamic content.
//!
//! Covers Open Graph, Twitter Card, canonical URL, robots, authorship,
//! article metadata, and theme color.
//!
//! Usage:
//! ```rust
//! use kbve::social::SocialMeta;
//!
//! let meta = SocialMeta::builder("My Page Title")
//!     .description("A great page")
//!     .url("https://example.com/page")
//!     .canonical_url("https://example.com/page")
//!     .image("https://cdn.example.com/img.jpg")
//!     .image_dimensions(1200, 630)
//!     .image_alt("A preview image")
//!     .site_name("Example")
//!     .author("username")
//!     .twitter_site("@example")
//!     .build();
//!
//! assert_eq!(meta.title(), "My Page Title");
//! assert_eq!(meta.twitter_card(), "summary_large_image");
//! assert_eq!(meta.robots(), "index, follow");
//! ```

use std::borrow::Cow;

/// Complete social meta tags for OG, Twitter Card, canonical, robots, and article metadata.
///
/// Uses `Cow<'static, str>` throughout — static strings (site names, card types, robots)
/// are zero-allocation; dynamic values (titles, URLs) borrow or own as needed.
#[derive(Debug, Clone)]
pub struct SocialMeta {
    // Core
    title: Cow<'static, str>,
    description: Cow<'static, str>,
    url: Cow<'static, str>,
    canonical_url: Cow<'static, str>,

    // Open Graph
    site_name: Cow<'static, str>,
    og_type: Cow<'static, str>,
    locale: Cow<'static, str>,

    // Images
    image: Cow<'static, str>,
    image_width: u32,
    image_height: u32,
    image_alt: Cow<'static, str>,

    // Twitter
    twitter_card: Cow<'static, str>,
    twitter_site: Cow<'static, str>,
    twitter_creator: Cow<'static, str>,

    // Authorship
    author: Cow<'static, str>,

    // SEO
    robots: Cow<'static, str>,

    // Article extensions (optional)
    published_time: Option<Cow<'static, str>>,
    modified_time: Option<Cow<'static, str>>,
    tags: Vec<Cow<'static, str>>,
    section: Option<Cow<'static, str>>,
    theme_color: Option<Cow<'static, str>>,
}

impl SocialMeta {
    /// Start building a SocialMeta with the required title.
    pub fn builder(title: impl Into<Cow<'static, str>>) -> SocialMetaBuilder {
        SocialMetaBuilder {
            title: title.into(),
            description: Cow::Borrowed(""),
            url: Cow::Borrowed(""),
            canonical_url: Cow::Borrowed(""),
            site_name: Cow::Borrowed("KBVE"),
            og_type: Cow::Borrowed("website"),
            locale: Cow::Borrowed("en_US"),
            image: Cow::Borrowed(""),
            image_width: 0,
            image_height: 0,
            image_alt: Cow::Borrowed(""),
            twitter_card: Cow::Borrowed("summary_large_image"),
            twitter_site: Cow::Borrowed(""),
            twitter_creator: Cow::Borrowed(""),
            author: Cow::Borrowed(""),
            robots: Cow::Borrowed("index, follow"),
            published_time: None,
            modified_time: None,
            tags: Vec::new(),
            section: None,
            theme_color: None,
        }
    }

    // ── Core ─────────────────────────────────────────────────────

    #[inline]
    pub fn title(&self) -> &str {
        &self.title
    }

    #[inline]
    pub fn description(&self) -> &str {
        &self.description
    }

    #[inline]
    pub fn url(&self) -> &str {
        &self.url
    }

    #[inline]
    pub fn canonical_url(&self) -> &str {
        &self.canonical_url
    }

    // ── Open Graph ───────────────────────────────────────────────

    #[inline]
    pub fn site_name(&self) -> &str {
        &self.site_name
    }

    #[inline]
    pub fn og_type(&self) -> &str {
        &self.og_type
    }

    #[inline]
    pub fn locale(&self) -> &str {
        &self.locale
    }

    // ── Images ───────────────────────────────────────────────────

    #[inline]
    pub fn image(&self) -> &str {
        &self.image
    }

    #[inline]
    pub fn image_width(&self) -> u32 {
        self.image_width
    }

    #[inline]
    pub fn image_height(&self) -> u32 {
        self.image_height
    }

    #[inline]
    pub fn image_alt(&self) -> &str {
        &self.image_alt
    }

    #[inline]
    pub fn has_image(&self) -> bool {
        !self.image.is_empty()
    }

    #[inline]
    pub fn has_dimensions(&self) -> bool {
        self.image_width > 0 && self.image_height > 0
    }

    // ── Twitter ──────────────────────────────────────────────────

    #[inline]
    pub fn twitter_card(&self) -> &str {
        &self.twitter_card
    }

    #[inline]
    pub fn twitter_site(&self) -> &str {
        &self.twitter_site
    }

    #[inline]
    pub fn twitter_creator(&self) -> &str {
        &self.twitter_creator
    }

    // ── Authorship ───────────────────────────────────────────────

    #[inline]
    pub fn author(&self) -> &str {
        &self.author
    }

    #[inline]
    pub fn has_author(&self) -> bool {
        !self.author.is_empty()
    }

    // ── SEO ──────────────────────────────────────────────────────

    #[inline]
    pub fn robots(&self) -> &str {
        &self.robots
    }

    // ── Article extensions ───────────────────────────────────────

    #[inline]
    pub fn published_time(&self) -> Option<&str> {
        self.published_time.as_deref()
    }

    #[inline]
    pub fn modified_time(&self) -> Option<&str> {
        self.modified_time.as_deref()
    }

    pub fn tags(&self) -> &[Cow<'static, str>] {
        &self.tags
    }

    #[inline]
    pub fn section(&self) -> Option<&str> {
        self.section.as_deref()
    }

    #[inline]
    pub fn theme_color(&self) -> Option<&str> {
        self.theme_color.as_deref()
    }
}

/// Builder for [`SocialMeta`].
pub struct SocialMetaBuilder {
    title: Cow<'static, str>,
    description: Cow<'static, str>,
    url: Cow<'static, str>,
    canonical_url: Cow<'static, str>,
    site_name: Cow<'static, str>,
    og_type: Cow<'static, str>,
    locale: Cow<'static, str>,
    image: Cow<'static, str>,
    image_width: u32,
    image_height: u32,
    image_alt: Cow<'static, str>,
    twitter_card: Cow<'static, str>,
    twitter_site: Cow<'static, str>,
    twitter_creator: Cow<'static, str>,
    author: Cow<'static, str>,
    robots: Cow<'static, str>,
    published_time: Option<Cow<'static, str>>,
    modified_time: Option<Cow<'static, str>>,
    tags: Vec<Cow<'static, str>>,
    section: Option<Cow<'static, str>>,
    theme_color: Option<Cow<'static, str>>,
}

impl SocialMetaBuilder {
    // Core
    pub fn description(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.description = v.into();
        self
    }

    pub fn url(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.url = v.into();
        self
    }

    pub fn canonical_url(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.canonical_url = v.into();
        self
    }

    // Open Graph
    pub fn site_name(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.site_name = v.into();
        self
    }

    /// OG type. Default: `"website"`. Common: `"article"`, `"profile"`.
    pub fn og_type(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.og_type = v.into();
        self
    }

    /// OG locale. Default: `"en_US"`.
    pub fn locale(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.locale = v.into();
        self
    }

    // Images
    pub fn image(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.image = v.into();
        self
    }

    pub fn image_dimensions(mut self, w: u32, h: u32) -> Self {
        self.image_width = w;
        self.image_height = h;
        self
    }

    pub fn image_alt(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.image_alt = v.into();
        self
    }

    // Twitter
    /// Twitter card type. Default: `"summary_large_image"`. Also: `"summary"`.
    pub fn twitter_card(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.twitter_card = v.into();
        self
    }

    /// Twitter site handle (e.g. `"@kbaborern"`).
    pub fn twitter_site(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.twitter_site = v.into();
        self
    }

    /// Twitter creator handle (e.g. `"@h0lybyte"`).
    pub fn twitter_creator(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.twitter_creator = v.into();
        self
    }

    // Authorship
    pub fn author(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.author = v.into();
        self
    }

    // SEO
    /// Robots directive. Default: `"index, follow"`.
    /// Use `"noindex, nofollow"` for private pages.
    pub fn robots(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.robots = v.into();
        self
    }

    // Article extensions
    /// ISO 8601 datetime when the content was first published.
    pub fn published_time(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.published_time = Some(v.into());
        self
    }

    /// ISO 8601 datetime when the content was last modified.
    pub fn modified_time(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.modified_time = Some(v.into());
        self
    }

    /// Article tags (e.g. content categories).
    pub fn tags(mut self, v: Vec<Cow<'static, str>>) -> Self {
        self.tags = v;
        self
    }

    /// Add a single tag.
    pub fn tag(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.tags.push(v.into());
        self
    }

    /// Article section (e.g. "Technology", "Humor").
    pub fn section(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.section = Some(v.into());
        self
    }

    /// Theme color for browsers (e.g. "#0c0c0e").
    pub fn theme_color(mut self, v: impl Into<Cow<'static, str>>) -> Self {
        self.theme_color = Some(v.into());
        self
    }

    /// Consume the builder and produce a [`SocialMeta`].
    pub fn build(self) -> SocialMeta {
        SocialMeta {
            title: self.title,
            description: self.description,
            url: self.url,
            canonical_url: self.canonical_url,
            site_name: self.site_name,
            og_type: self.og_type,
            locale: self.locale,
            image: self.image,
            image_width: self.image_width,
            image_height: self.image_height,
            image_alt: self.image_alt,
            twitter_card: self.twitter_card,
            twitter_site: self.twitter_site,
            twitter_creator: self.twitter_creator,
            author: self.author,
            robots: self.robots,
            published_time: self.published_time,
            modified_time: self.modified_time,
            tags: self.tags,
            section: self.section,
            theme_color: self.theme_color,
        }
    }
}

/// Presets for common social meta configurations.
impl SocialMeta {
    /// Meme page preset — OG type "article", large image card, Meme.sh branding.
    pub fn meme(
        title: impl Into<Cow<'static, str>>,
        description: impl Into<Cow<'static, str>>,
        canonical_url: impl Into<Cow<'static, str>>,
        image: impl Into<Cow<'static, str>>,
        image_dimensions: (u32, u32),
        author: impl Into<Cow<'static, str>>,
        tags: Vec<Cow<'static, str>>,
    ) -> Self {
        let canonical = canonical_url.into();
        Self::builder(title)
            .description(description)
            .url(canonical.clone())
            .canonical_url(canonical)
            .image(image)
            .image_dimensions(image_dimensions.0, image_dimensions.1)
            .site_name("Meme.sh")
            .og_type("article")
            .twitter_card("summary_large_image")
            .author(author)
            .tags(tags)
            .theme_color("#0c0c0e")
            .build()
    }

    /// Profile page preset — OG type "profile", summary card, KBVE branding.
    pub fn profile(
        username: impl Into<Cow<'static, str>>,
        description: impl Into<Cow<'static, str>>,
        canonical_url: impl Into<Cow<'static, str>>,
        avatar: impl Into<Cow<'static, str>>,
    ) -> Self {
        let username = username.into();
        let canonical = canonical_url.into();
        Self::builder(Cow::Owned(format!("@{username}")))
            .description(description)
            .url(canonical.clone())
            .canonical_url(canonical)
            .image(avatar)
            .og_type("profile")
            .twitter_card("summary")
            .author(username)
            .robots("index, follow")
            .build()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builder_defaults() {
        let meta = SocialMeta::builder("Test Title").build();
        assert_eq!(meta.title(), "Test Title");
        assert_eq!(meta.site_name(), "KBVE");
        assert_eq!(meta.og_type(), "website");
        assert_eq!(meta.locale(), "en_US");
        assert_eq!(meta.twitter_card(), "summary_large_image");
        assert_eq!(meta.robots(), "index, follow");
        assert_eq!(meta.description(), "");
        assert_eq!(meta.canonical_url(), "");
        assert!(!meta.has_image());
        assert!(!meta.has_dimensions());
        assert!(!meta.has_author());
        assert!(meta.published_time().is_none());
        assert!(meta.modified_time().is_none());
        assert!(meta.tags().is_empty());
        assert!(meta.section().is_none());
        assert!(meta.theme_color().is_none());
    }

    #[test]
    fn builder_full() {
        let meta = SocialMeta::builder("My Page")
            .description("A description")
            .url("https://example.com")
            .canonical_url("https://example.com")
            .image("https://cdn.example.com/img.jpg")
            .image_dimensions(1200, 630)
            .image_alt("Preview image")
            .site_name("MySite")
            .og_type("article")
            .locale("en_GB")
            .twitter_card("summary")
            .twitter_site("@mysite")
            .twitter_creator("@author")
            .author("user1")
            .robots("noindex")
            .published_time("2026-03-19T00:00:00Z")
            .modified_time("2026-03-19T12:00:00Z")
            .tag("humor")
            .tag("tech")
            .section("Technology")
            .theme_color("#1a1a2e")
            .build();

        assert_eq!(meta.title(), "My Page");
        assert_eq!(meta.description(), "A description");
        assert_eq!(meta.url(), "https://example.com");
        assert_eq!(meta.canonical_url(), "https://example.com");
        assert_eq!(meta.image(), "https://cdn.example.com/img.jpg");
        assert_eq!(meta.image_width(), 1200);
        assert_eq!(meta.image_height(), 630);
        assert_eq!(meta.image_alt(), "Preview image");
        assert_eq!(meta.site_name(), "MySite");
        assert_eq!(meta.og_type(), "article");
        assert_eq!(meta.locale(), "en_GB");
        assert_eq!(meta.twitter_card(), "summary");
        assert_eq!(meta.twitter_site(), "@mysite");
        assert_eq!(meta.twitter_creator(), "@author");
        assert_eq!(meta.author(), "user1");
        assert_eq!(meta.robots(), "noindex");
        assert_eq!(meta.published_time(), Some("2026-03-19T00:00:00Z"));
        assert_eq!(meta.modified_time(), Some("2026-03-19T12:00:00Z"));
        assert_eq!(meta.tags().len(), 2);
        assert_eq!(meta.section(), Some("Technology"));
        assert_eq!(meta.theme_color(), Some("#1a1a2e"));
        assert!(meta.has_image());
        assert!(meta.has_dimensions());
        assert!(meta.has_author());
    }

    #[test]
    fn static_strings_are_borrowed() {
        let meta = SocialMeta::builder("Static Title")
            .site_name("KBVE")
            .og_type("website")
            .locale("en_US")
            .robots("index, follow")
            .build();

        assert!(matches!(meta.site_name, Cow::Borrowed(_)));
        assert!(matches!(meta.og_type, Cow::Borrowed(_)));
        assert!(matches!(meta.locale, Cow::Borrowed(_)));
        assert!(matches!(meta.robots, Cow::Borrowed(_)));
    }

    #[test]
    fn dynamic_strings_are_owned() {
        let title = format!("Meme #{}", 42);
        let meta = SocialMeta::builder(title).build();
        assert!(matches!(meta.title, Cow::Owned(_)));
        assert_eq!(meta.title(), "Meme #42");
    }

    #[test]
    fn meme_preset() {
        let meta = SocialMeta::meme(
            "Funny Cat",
            "A image by user1 on Meme.sh",
            "https://meme.sh/meme/01ABC",
            "https://cdn.meme.sh/t/abc.jpg",
            (800, 600),
            "user1",
            vec![Cow::Borrowed("funny"), Cow::Borrowed("cats")],
        );
        assert_eq!(meta.site_name(), "Meme.sh");
        assert_eq!(meta.og_type(), "article");
        assert_eq!(meta.twitter_card(), "summary_large_image");
        assert_eq!(meta.author(), "user1");
        assert_eq!(meta.canonical_url(), "https://meme.sh/meme/01ABC");
        assert_eq!(meta.url(), "https://meme.sh/meme/01ABC");
        assert_eq!(meta.theme_color(), Some("#0c0c0e"));
        assert_eq!(meta.tags().len(), 2);
        assert!(meta.has_dimensions());
    }

    #[test]
    fn profile_preset() {
        let meta = SocialMeta::profile(
            "h0lybyte",
            "h0lybyte's profile on KBVE",
            "https://kbve.com/@h0lybyte",
            "https://cdn.kbve.com/avatars/h0lybyte.jpg",
        );
        assert_eq!(meta.title(), "@h0lybyte");
        assert_eq!(meta.og_type(), "profile");
        assert_eq!(meta.twitter_card(), "summary");
        assert_eq!(meta.author(), "h0lybyte");
        assert_eq!(meta.canonical_url(), "https://kbve.com/@h0lybyte");
        assert_eq!(meta.robots(), "index, follow");
    }

    #[test]
    fn url_and_canonical_independent() {
        let meta = SocialMeta::builder("Title")
            .url("https://meme.sh/meme/01ABC")
            .canonical_url("https://meme.sh/meme/01ABC?ref=share")
            .build();
        assert_eq!(meta.url(), "https://meme.sh/meme/01ABC");
        assert_eq!(meta.canonical_url(), "https://meme.sh/meme/01ABC?ref=share");
    }

    #[test]
    fn no_dimensions_when_zero() {
        let meta = SocialMeta::builder("Title")
            .image("https://img.test/x.jpg")
            .build();
        assert!(meta.has_image());
        assert!(!meta.has_dimensions());
    }

    #[test]
    fn partial_dimensions_not_valid() {
        let meta = SocialMeta::builder("Title")
            .image_dimensions(100, 0)
            .build();
        assert!(!meta.has_dimensions());
    }
}
