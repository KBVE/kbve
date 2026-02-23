use godot::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
pub struct UxUiElement {
    pub element_type: String,
    pub id: String,
    pub properties: Value,
}

impl UxUiElement {
    pub fn from_json(json_str: &str) -> Result<Vec<Self>, serde_json::Error> {
        serde_json::from_str(json_str)
    }

    pub fn from_gstring(json_gstr: GString) -> Result<Vec<Self>, serde_json::Error> {
        let json_str = json_gstr.to_string();
        Self::from_json(&json_str)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MenuButtonData {
    pub title: String,
    pub callback: String,
    pub params: Vec<Value>,
}

impl TryFrom<UxUiElement> for MenuButtonData {
    type Error = &'static str;

    fn try_from(element: UxUiElement) -> Result<Self, Self::Error> {
        if element.element_type != "button" {
            return Err("[UxUI] Element is not a button");
        }

        let props = element
            .properties
            .as_object()
            .ok_or("[UxUI] Properties must be an object")?;

        let title = props
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Button")
            .to_string();

        let callback = props
            .get("callback")
            .and_then(|v| v.as_str())
            .ok_or("[UxUI] Missing callback")?
            .to_string();

        let params = props
            .get("params")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().cloned().collect())
            .unwrap_or_else(Vec::new);

        Ok(MenuButtonData {
            title,
            callback,
            params,
        })
    }
}
