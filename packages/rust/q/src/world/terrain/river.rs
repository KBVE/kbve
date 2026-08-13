use godot::classes::{MeshInstance3D, PlaneMesh};
use godot::prelude::*;

use super::QTerrain;

impl QTerrain {
    pub(super) fn build_river_planes(&mut self) {
        let strip_width = ((self.river_wander * 2.0 + self.river_width * 8.0) / 4.0).ceil() * 4.0;

        if crate::world::q_hidden("riverbed") {
            self.build_water_plane(strip_width);
            return;
        }
        if crate::world::q_hidden("water") {
            self.build_bed_plane(strip_width);
            return;
        }
        self.build_bed_plane(strip_width);
        self.build_water_plane(strip_width);
    }

    fn share_bed_bounds(&mut self, strip_width: f32) {
        const EDGE_MARGIN: f32 = 6.0;
        let half = strip_width * 0.5;
        if let Some(m) = self.riverbed_material.as_mut() {
            m.set_shader_parameter("bed_half_width", &half.to_variant());
            m.set_shader_parameter("bed_edge_margin", &EDGE_MARGIN.to_variant());
        }
        self.share_ground_palette();
    }

    fn share_ground_palette(&mut self) {
        const KEYS: [(&str, &str); 6] = [
            ("color_small", "ground_color_small"),
            ("color_large", "ground_color_large"),
            ("patch_noise", "ground_patch_noise"),
            ("patch_scale", "ground_patch_scale"),
            ("soil_color", "ground_soil_color"),
            ("litter_color", "ground_litter_color"),
        ];
        let Some(ground) = self.ground_material.clone() else {
            return;
        };
        let mut values: Vec<(&str, Variant)> = KEYS
            .iter()
            .map(|(from, to)| (*to, ground.get_shader_parameter(&StringName::from(*from))))
            .collect();
        values.push((
            "ground_soil_strength",
            ground.get_shader_parameter("soil_strength"),
        ));
        values.push((
            "ground_clearance_tex",
            ground.get_shader_parameter("clearance_tex"),
        ));
        if let Some(m) = self.riverbed_material.as_mut() {
            for (name, value) in values {
                if !value.is_nil() {
                    m.set_shader_parameter(&StringName::from(name), &value);
                }
            }
        }
    }

    fn build_bed_plane(&mut self, strip_width: f32) {
        self.share_bed_bounds(strip_width);
        let mut bed_plane = PlaneMesh::new_gd();
        bed_plane.set_size(Vector2::new(strip_width, self.extent * 2.0));
        bed_plane.set_subdivide_width(((strip_width * 0.5) as i32 - 1).max(1));
        bed_plane.set_subdivide_depth((self.extent as i32 - 1).max(1));
        let mut bed = MeshInstance3D::new_alloc();
        bed.set_name("Riverbed");
        bed.set_mesh(&bed_plane);
        if let Some(m) = self.riverbed_material.as_ref() {
            bed.set_material_override(m);
        }
        bed.set_extra_cull_margin(16.0);
        self.base_mut().add_child(&bed);
    }

    fn build_water_plane(&mut self, strip_width: f32) {
        let mut plane = PlaneMesh::new_gd();
        plane.set_size(Vector2::new(strip_width, self.extent * 2.0));
        plane.set_subdivide_width((strip_width as i32 - 1).max(1));
        plane.set_subdivide_depth((self.extent as i32 * 2 - 1).max(1));
        let mut water = MeshInstance3D::new_alloc();
        water.set_name("Water");
        water.set_mesh(&plane);
        if let Some(m) = self.water_material.as_ref() {
            water.set_material_override(m);
        }
        water.set_position(Vector3::new(0.0, self.water_level, 0.0));
        water.set_extra_cull_margin(16.0);
        self.base_mut().add_child(&water);
    }
}
