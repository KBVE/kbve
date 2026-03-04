use serde::{Deserialize, Serialize};

/// Meme format matching DB SMALLINT values.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum MemeFormat {
    Unspecified,
    Image,
    Gif,
    Video,
    WebpAnim,
}

impl MemeFormat {
    pub fn from_i16(v: i16) -> Self {
        match v {
            1 => Self::Image,
            2 => Self::Gif,
            3 => Self::Video,
            4 => Self::WebpAnim,
            _ => Self::Unspecified,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Image => "image",
            Self::Gif => "GIF",
            Self::Video => "video",
            Self::WebpAnim => "animated image",
            Self::Unspecified => "meme",
        }
    }
}

/// Core meme data. Field names match the `service_fetch_feed` /
/// `service_get_meme_by_id` RPC return columns exactly.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meme {
    pub id: String,
    pub title: Option<String>,
    pub format: i16,
    pub asset_url: String,
    pub thumbnail_url: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub view_count: i64,
    #[serde(default)]
    pub reaction_count: i64,
    #[serde(default)]
    pub comment_count: i64,
    #[serde(default)]
    pub save_count: i64,
    #[serde(default)]
    pub share_count: i64,
    pub created_at: String,
    pub author_name: Option<String>,
    pub author_avatar: Option<String>,
}

impl Meme {
    pub fn display_title(&self) -> &str {
        self.title.as_deref().unwrap_or("Untitled Meme")
    }

    pub fn format_enum(&self) -> MemeFormat {
        MemeFormat::from_i16(self.format)
    }

    pub fn format_label(&self) -> &'static str {
        self.format_enum().label()
    }

    pub fn og_description(&self) -> String {
        let author = self.author_name.as_deref().unwrap_or("Anonymous");
        let fmt = self.format_enum().label();
        format!("A {} by {} on Meme.sh", fmt, author)
    }

    /// Prefer thumbnail_url, fall back to asset_url.
    pub fn og_image(&self) -> &str {
        self.thumbnail_url.as_deref().unwrap_or(&self.asset_url)
    }

    pub fn canonical_url(&self) -> String {
        format!("https://meme.sh/meme/{}", self.id)
    }
}

/// Paginated feed response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedPage {
    pub memes: Vec<Meme>,
    pub next_cursor: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_meme() -> Meme {
        Meme {
            id: "01ABCDEFGHJKMNPQRSTVWXYZ01".into(),
            title: Some("Dank Meme".into()),
            format: 1,
            asset_url: "https://cdn.meme.sh/m/abc.jpg".into(),
            thumbnail_url: Some("https://cdn.meme.sh/t/abc.jpg".into()),
            width: Some(800),
            height: Some(600),
            tags: vec!["funny".into(), "cats".into()],
            view_count: 42,
            reaction_count: 7,
            comment_count: 3,
            save_count: 1,
            share_count: 2,
            created_at: "2026-03-01T00:00:00Z".into(),
            author_name: Some("TestUser".into()),
            author_avatar: Some("https://cdn.meme.sh/a/user.jpg".into()),
        }
    }

    #[test]
    fn format_round_trip() {
        assert_eq!(MemeFormat::from_i16(1), MemeFormat::Image);
        assert_eq!(MemeFormat::from_i16(2), MemeFormat::Gif);
        assert_eq!(MemeFormat::from_i16(3), MemeFormat::Video);
        assert_eq!(MemeFormat::from_i16(4), MemeFormat::WebpAnim);
        assert_eq!(MemeFormat::from_i16(99), MemeFormat::Unspecified);
    }

    #[test]
    fn format_labels() {
        assert_eq!(MemeFormat::Image.label(), "image");
        assert_eq!(MemeFormat::Gif.label(), "GIF");
        assert_eq!(MemeFormat::Video.label(), "video");
        assert_eq!(MemeFormat::WebpAnim.label(), "animated image");
        assert_eq!(MemeFormat::Unspecified.label(), "meme");
    }

    #[test]
    fn display_title_with_title() {
        let m = sample_meme();
        assert_eq!(m.display_title(), "Dank Meme");
    }

    #[test]
    fn display_title_without_title() {
        let mut m = sample_meme();
        m.title = None;
        assert_eq!(m.display_title(), "Untitled Meme");
    }

    #[test]
    fn og_description_format() {
        let m = sample_meme();
        assert_eq!(m.og_description(), "A image by TestUser on Meme.sh");
    }

    #[test]
    fn og_description_anonymous() {
        let mut m = sample_meme();
        m.author_name = None;
        assert_eq!(m.og_description(), "A image by Anonymous on Meme.sh");
    }

    #[test]
    fn og_image_prefers_thumbnail() {
        let m = sample_meme();
        assert_eq!(m.og_image(), "https://cdn.meme.sh/t/abc.jpg");
    }

    #[test]
    fn og_image_falls_back_to_asset() {
        let mut m = sample_meme();
        m.thumbnail_url = None;
        assert_eq!(m.og_image(), "https://cdn.meme.sh/m/abc.jpg");
    }

    #[test]
    fn canonical_url_format() {
        let m = sample_meme();
        assert_eq!(
            m.canonical_url(),
            "https://meme.sh/meme/01ABCDEFGHJKMNPQRSTVWXYZ01"
        );
    }

    #[test]
    fn deserialize_from_json() {
        let json = serde_json::json!({
            "id": "01ABCDEFGHJKMNPQRSTVWXYZ01",
            "title": "Test",
            "format": 2,
            "asset_url": "https://example.com/m.gif",
            "thumbnail_url": null,
            "width": null,
            "height": null,
            "tags": ["funny"],
            "view_count": 10,
            "reaction_count": 5,
            "comment_count": 0,
            "save_count": 0,
            "share_count": 0,
            "created_at": "2026-03-01T00:00:00Z",
            "author_name": "User1",
            "author_avatar": null
        });
        let meme: Meme = serde_json::from_value(json).unwrap();
        assert_eq!(meme.id, "01ABCDEFGHJKMNPQRSTVWXYZ01");
        assert_eq!(meme.format_enum(), MemeFormat::Gif);
        assert!(meme.thumbnail_url.is_none());
        assert_eq!(meme.tags, vec!["funny"]);
    }

    #[test]
    fn deserialize_with_missing_defaults() {
        let json = serde_json::json!({
            "id": "01ABCDEFGHJKMNPQRSTVWXYZ01",
            "title": null,
            "format": 1,
            "asset_url": "https://example.com/m.jpg",
            "thumbnail_url": null,
            "width": null,
            "height": null,
            "created_at": "2026-03-01T00:00:00Z",
            "author_name": null,
            "author_avatar": null
        });
        let meme: Meme = serde_json::from_value(json).unwrap();
        assert!(meme.tags.is_empty());
        assert_eq!(meme.view_count, 0);
        assert_eq!(meme.reaction_count, 0);
    }
}
