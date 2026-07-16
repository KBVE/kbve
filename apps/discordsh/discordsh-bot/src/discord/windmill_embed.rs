use poise::serenity_prelude as serenity;
use serde::Deserialize;
use serde_json::Value;

use crate::discord::branding;

const TITLE_MAX: usize = 256;
const DESC_MAX: usize = 4096;
const FIELD_NAME_MAX: usize = 256;
const FIELD_VALUE_MAX: usize = 1024;
const FOOTER_MAX: usize = 2048;
const AUTHOR_MAX: usize = 256;
const FIELDS_MAX: usize = 25;

#[derive(Debug, Deserialize)]
pub struct WmField {
    pub name: String,
    pub value: String,
    #[serde(default)]
    pub inline: bool,
}

#[derive(Debug, Deserialize)]
pub struct WmEmbed {
    pub title: Option<String>,
    pub description: Option<String>,
    pub url: Option<String>,
    pub color: Option<u32>,
    #[serde(default)]
    pub fields: Vec<WmField>,
    pub footer: Option<String>,
    pub author: Option<String>,
    pub thumbnail: Option<String>,
    pub image: Option<String>,
}

impl WmEmbed {
    pub fn build(self) -> serenity::CreateEmbed {
        let mut embed = serenity::CreateEmbed::new()
            .color(self.color.unwrap_or(branding::GH_TASK));

        if let Some(title) = self.title {
            embed = embed.title(truncate(&title, TITLE_MAX));
        }
        if let Some(description) = self.description {
            embed = embed.description(truncate(&description, DESC_MAX));
        }
        if let Some(url) = self.url {
            embed = embed.url(url);
        }
        if let Some(author) = self.author {
            embed = embed.author(
                serenity::CreateEmbedAuthor::new(truncate(&author, AUTHOR_MAX)),
            );
        }
        for field in self.fields.into_iter().take(FIELDS_MAX) {
            embed = embed.field(
                truncate(&field.name, FIELD_NAME_MAX),
                truncate(&field.value, FIELD_VALUE_MAX),
                field.inline,
            );
        }
        if let Some(thumbnail) = self.thumbnail {
            embed = embed.thumbnail(thumbnail);
        }
        if let Some(image) = self.image {
            embed = embed.image(image);
        }
        embed = match self.footer {
            Some(footer) => {
                // branding::embed_footer appends " | <bot> v<ver>"; reserve that
                // width so the composed footer stays within Discord's limit.
                let reserve = branding::footer_text().chars().count() + 3;
                let room = FOOTER_MAX.saturating_sub(reserve);
                embed.footer(branding::embed_footer(Some(&truncate(&footer, room))))
            }
            None => embed.footer(branding::embed_footer(None)),
        };
        embed
    }
}

/// Build a Discord embed from a Windmill job result iff the result carries a
/// top-level `embed` object that deserializes into [`WmEmbed`]. Any other
/// shape (or a malformed embed) returns `None`, so the caller falls back to
/// rendering the raw JSON.
pub fn embed_from_value(value: &Value) -> Option<serenity::CreateEmbed> {
    let embed_val = value.get("embed")?;
    let spec: WmEmbed = serde_json::from_value(embed_val.clone()).ok()?;
    Some(spec.build())
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_owned();
    }
    let keep = max.saturating_sub(1);
    let cut: String = s.chars().take(keep).collect();
    format!("{cut}…")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn embed_json(value: &Value) -> Value {
        let embed = embed_from_value(value).expect("embed");
        serde_json::to_value(&embed).expect("serialize")
    }

    #[test]
    fn no_embed_key_returns_none() {
        let v = serde_json::json!({ "title": "not wrapped", "lines": [] });
        assert!(embed_from_value(&v).is_none());
    }

    #[test]
    fn malformed_embed_returns_none() {
        // `fields` must be an array of objects; a string is malformed.
        let v = serde_json::json!({ "embed": { "fields": "nope" } });
        assert!(embed_from_value(&v).is_none());
    }

    #[test]
    fn basic_embed_maps_fields() {
        let v = serde_json::json!({ "embed": {
            "title": "T",
            "description": "D",
            "color": 123456,
            "author": "A",
            "fields": [{ "name": "n", "value": "v", "inline": true }],
        }});
        let j = embed_json(&v);
        assert_eq!(j["title"], "T");
        assert_eq!(j["description"], "D");
        assert_eq!(j["color"], 123456);
        assert_eq!(j["author"]["name"], "A");
        assert_eq!(j["fields"][0]["name"], "n");
        assert_eq!(j["fields"][0]["value"], "v");
        assert_eq!(j["fields"][0]["inline"], true);
    }

    #[test]
    fn title_truncated_to_limit() {
        let long = "x".repeat(300);
        let v = serde_json::json!({ "embed": { "title": long } });
        let j = embed_json(&v);
        assert_eq!(j["title"].as_str().unwrap().chars().count(), TITLE_MAX);
        assert!(j["title"].as_str().unwrap().ends_with('…'));
    }

    #[test]
    fn fields_capped_at_25() {
        let fields: Vec<Value> = (0..40)
            .map(|i| serde_json::json!({ "name": format!("n{i}"), "value": "v" }))
            .collect();
        let v = serde_json::json!({ "embed": { "fields": fields } });
        let j = embed_json(&v);
        assert_eq!(j["fields"].as_array().unwrap().len(), FIELDS_MAX);
    }

    #[test]
    fn field_value_truncated() {
        let big = "y".repeat(2000);
        let v = serde_json::json!({ "embed": {
            "fields": [{ "name": "n", "value": big }],
        }});
        let j = embed_json(&v);
        assert_eq!(
            j["fields"][0]["value"].as_str().unwrap().chars().count(),
            FIELD_VALUE_MAX
        );
    }

    #[test]
    fn author_and_field_name_truncated() {
        let long = "z".repeat(400);
        let v = serde_json::json!({ "embed": {
            "author": long.clone(),
            "fields": [{ "name": long, "value": "v" }],
        }});
        let j = embed_json(&v);
        assert_eq!(
            j["author"]["name"].as_str().unwrap().chars().count(),
            AUTHOR_MAX
        );
        assert_eq!(
            j["fields"][0]["name"].as_str().unwrap().chars().count(),
            FIELD_NAME_MAX
        );
    }

    #[test]
    fn thumbnail_and_image_passthrough() {
        let v = serde_json::json!({ "embed": {
            "thumbnail": "https://example.com/t.png",
            "image": "https://example.com/i.png",
        }});
        let j = embed_json(&v);
        assert_eq!(j["thumbnail"]["url"], "https://example.com/t.png");
        assert_eq!(j["image"]["url"], "https://example.com/i.png");
    }

    #[test]
    fn footer_truncated() {
        let long = "w".repeat(FOOTER_MAX + 100);
        let v = serde_json::json!({ "embed": { "footer": long } });
        let j = embed_json(&v);
        assert_eq!(
            j["footer"]["text"].as_str().unwrap().chars().count(),
            FOOTER_MAX
        );
    }

    #[test]
    fn default_color_when_absent() {
        let v = serde_json::json!({ "embed": { "title": "T" } });
        let j = embed_json(&v);
        assert_eq!(j["color"], branding::GH_TASK);
    }

    #[test]
    fn truncate_respects_char_boundary() {
        let s = "é".repeat(300);
        let out = truncate(&s, TITLE_MAX);
        assert_eq!(out.chars().count(), TITLE_MAX);
        assert!(out.ends_with('…'));
    }
}
