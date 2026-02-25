use crate::impl_node_ext_common;
use godot::classes::control::LayoutPreset;
use godot::classes::{Button, CanvasLayer, Control};
use godot::prelude::*;

//  Control Extension

pub trait ControlExt {
    fn with_name(self, name: &str) -> Self;
    fn with_cache(self, prefix: &str, key: &GString) -> Self;
    fn with_anchors_preset(self, preset: LayoutPreset) -> Self;
    fn with_anchor_and_offset(self, side: Side, anchor: f32, offset: f32) -> Self;
    fn with_custom_minimum_size(self, size: Vector2) -> Self;
}

impl_node_ext_common!(ControlExt, Control {
    fn with_anchors_preset(mut self, preset: LayoutPreset) -> Self {
        self.set_anchors_preset(preset);
        self
    }

    fn with_anchor_and_offset(mut self, side: Side, anchor: f32, offset: f32) -> Self {
        self.set_anchor_and_offset(side, anchor, offset);
        self
    }

    fn with_custom_minimum_size(mut self, size: Vector2) -> Self {
        self.set_custom_minimum_size(size);
        self
    }
});

//  Button Extension

pub trait ButtonExt {
    fn with_name(self, name: &str) -> Self;
    fn with_cache(self, prefix: &str, key: &GString) -> Self;
    fn with_text(self, text: &GString) -> Self;
    fn with_anchors_preset(self, preset: LayoutPreset) -> Self;
    fn with_anchor_and_offset(self, side: Side, anchor: f32, offset: f32) -> Self;
    fn with_custom_minimum_size(self, size: Vector2) -> Self;
    fn with_callback(self, parent: &Gd<Node>, signal_name: &str, params: &[Variant]) -> Self;
}

impl_node_ext_common!(ButtonExt, Button {
    fn with_text(mut self, text: &GString) -> Self {
        self.set_text(text);
        self
    }

    fn with_anchors_preset(mut self, preset: LayoutPreset) -> Self {
        self.set_anchors_preset(preset);
        self
    }

    fn with_anchor_and_offset(mut self, side: Side, anchor: f32, offset: f32) -> Self {
        self.set_anchor_and_offset(side, anchor, offset);
        self
    }

    fn with_custom_minimum_size(mut self, size: Vector2) -> Self {
        self.set_custom_minimum_size(size);
        self
    }

    fn with_callback(mut self, parent: &Gd<Node>, signal_name: &str, params: &[Variant]) -> Self {
        if !parent.has_signal(signal_name) {
            let parent_name = parent.get_name().to_string();
            godot_warn!(
                "[ButtonExt] Signal '{}' does not exist on parent node '{}'",
                signal_name,
                parent_name
            );
            return self;
        }

        if self.is_connected("pressed", &parent.callable(signal_name)) {
            self.disconnect("pressed", &parent.callable(signal_name));
        }

        self.connect("pressed", &parent.callable(signal_name).bind(params));
        self
    }
});

//  Canvas

pub trait CanvasLayerExt {
    fn with_name(self, name: &str) -> Self;
    fn with_cache(self, prefix: &str, key: &GString) -> Self;
    fn with_follow_viewport(self, enabled: bool) -> Self;
    fn with_follow_viewport_scale(self, scale: f32) -> Self;
    fn with_offset(self, offset: Vector2) -> Self;
    fn with_scale(self, scale: Vector2) -> Self;
    fn with_responsive(self) -> Self;
    fn with_fixed_position(self, offset: Vector2, scale: Vector2) -> Self;
}

impl_node_ext_common!(CanvasLayerExt, CanvasLayer {
    fn with_follow_viewport(mut self, enabled: bool) -> Self {
        self.set_follow_viewport(enabled);
        self
    }

    fn with_follow_viewport_scale(mut self, scale: f32) -> Self {
        self.set_follow_viewport_scale(scale);
        self
    }

    fn with_offset(mut self, offset: Vector2) -> Self {
        self.set_offset(offset);
        self
    }

    fn with_scale(mut self, scale: Vector2) -> Self {
        self.set_scale(scale);
        self
    }

    fn with_responsive(self) -> Self {
        self.with_follow_viewport(true)
            .with_follow_viewport_scale(1.0)
    }

    fn with_fixed_position(self, offset: Vector2, scale: Vector2) -> Self {
        self.with_offset(offset).with_scale(scale)
    }
});
