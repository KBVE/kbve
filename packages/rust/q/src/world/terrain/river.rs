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

    fn build_bed_plane(&mut self, strip_width: f32) {
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
