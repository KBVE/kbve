//! The built places standing in the current window.
//!
//! Nothing here decides where anything is. [`crate::landmark`] does, from the seed
//! alone, and the server derives the same list to put the same boxes in its solver.
//! This turns that list into something to look at and something to walk into.

use godot::classes::{ArrayMesh, MeshInstance3D, StaticBody3D};
use godot::prelude::*;

use super::QTerrain;
use super::road::PlankMesh;
use crate::landmark::{Landmark, LandmarkKind};
use crate::worldgen::{HeightGen, Slab};

/// The node the whole window's structures hang off, so taking them down again is one
/// call rather than a search.
pub(super) const HOLDER: &str = "Landmarks";

impl QTerrain {
    /// Raises every landmark reaching this window and hands its boxes to the sim.
    pub(super) fn build_landmarks(&mut self) {
        let Some(hgen) = self.hgen.take() else {
            return;
        };
        let origin = self.window_origin();
        let marks = crate::landmark::in_window(
            hgen.seed(),
            &hgen,
            [origin.x, origin.y],
            self.extent + LANDMARK_MARGIN,
        );

        if !marks.is_empty() {
            let mut holder = Node3D::new_alloc();
            holder.set_name(HOLDER);
            self.base_mut().add_child(&holder);

            for mark in &marks {
                let slabs = mark.slabs(&hgen);
                if let Some(mesh) = Self::landmark_mesh(mark, &slabs) {
                    let mut view = MeshInstance3D::new_alloc();
                    view.set_mesh(&mesh);
                    if let Some(m) = self.landmark_material(mark) {
                        view.set_material_override(&m);
                    }
                    holder.add_child(&view);
                }

                let mut body = StaticBody3D::new_alloc();
                body.set_collision_layer(1);
                let shapes = Self::fit_slab_shapes(&mut body, &slabs);
                holder.add_child(&body);
                self.publish_sim_slabs(&shapes, &slabs);
            }
        }

        // Clearance is what keeps grass and flora off built ground. Without it a
        // capital's courtyard grows a lawn through its own flagstones.
        for mark in &marks {
            let r = match mark.kind {
                LandmarkKind::Capital => 74.0,
                LandmarkKind::Harbour => 46.0,
            };
            self.stamp_clearance(mark.centre[0], mark.centre[1], r);
        }
        if !marks.is_empty() {
            self.flush_clearance();
        }

        if self.landmark_log {
            self.landmark_log = false;
            let near = crate::landmark::nearest(hgen.seed(), &hgen, [origin.x, origin.y]);
            for mark in near {
                godot_print!(
                    "[q] nearest {:?} at {:.0}, {:.0} ({:.0}m away)",
                    mark.kind,
                    mark.centre[0],
                    mark.centre[1],
                    mark.distance([origin.x, origin.y])
                );
            }
        }

        self.hgen = Some(hgen);
        self.landmarks = marks;
    }

    /// Frees the previous window's structures and forgets their sim bodies.
    pub(super) fn clear_landmarks(&mut self) {
        self.landmarks.clear();
        if let Some(mut n) = self.base().get_node_or_null(HOLDER) {
            n.queue_free();
            self.base_mut().remove_child(&n);
        }
    }

    fn landmark_material(&self, mark: &Landmark) -> Option<Gd<godot::classes::ShaderMaterial>> {
        match mark.kind {
            // Stone for the walls and the keep, timber for the quay and its piers,
            // which is what the crossing is already surfaced with.
            LandmarkKind::Capital => self.abutment_material.clone(),
            LandmarkKind::Harbour => self.bridge_material.clone(),
        }
    }

    /// One mesh per landmark: every box drawn where its collider is.
    ///
    /// Deliberately the same list rather than a shape of its own. A blockout whose
    /// walls are somewhere other than the collision is a blockout that teaches the
    /// wrong thing about the place while it is being looked at.
    fn landmark_mesh(mark: &Landmark, slabs: &[Slab]) -> Option<Gd<ArrayMesh>> {
        let mut mb = PlankMesh::new();
        let right = Vector3::RIGHT;
        let fwd = Vector3::FORWARD;
        let uvs = match mark.kind {
            LandmarkKind::Capital => 0.35,
            LandmarkKind::Harbour => 0.5,
        };
        for slab in slabs {
            mb.box_at(
                Vector3::new(slab.centre[0], slab.centre[1], slab.centre[2]),
                Vector3::new(
                    slab.half_extents[0],
                    slab.half_extents[1],
                    slab.half_extents[2],
                ),
                right,
                fwd,
                uvs,
            );
        }
        mb.build()
    }

    /// The landmarks in this window as flow-field lines.
    ///
    /// Structures are solid and a field reading only the height grid sees flat, open,
    /// walkable ground where a wall is -- the levelling that made the courtyard usable
    /// is the same levelling that makes the keep look like a lawn. The way in is sent
    /// separately, because it has to be reopened after the field inflates its
    /// obstacles or the gateway closes itself.
    pub(super) fn landmark_bars(&self, hgen: &HeightGen) -> (Vec<f32>, Vec<f32>, Vec<f32>, f32) {
        let mut solid = Vec::new();
        let mut open = Vec::new();
        let mut decks = Vec::new();
        let mut deck_y = 0.0f32;
        for mark in &self.landmarks {
            let print = mark.footprint(hgen);
            deck_y = print.deck_y;
            for (into, bars) in [
                (&mut solid, &print.solid),
                (&mut open, &print.open),
                (&mut decks, &print.decks),
            ] {
                for bar in bars {
                    into.extend_from_slice(&[
                        bar.from[0],
                        bar.from[1],
                        bar.to[0],
                        bar.to[1],
                        bar.half_width,
                    ]);
                }
            }
        }
        (solid, open, decks, deck_y)
    }
}

/// How far past the window a landmark still counts as reaching into it.
///
/// A capital is wider than a stride, so one whose middle sits just outside still has
/// walls inside. Left out, the wall a player is standing against vanishes the moment
/// the window moves past its centre.
const LANDMARK_MARGIN: f32 = 80.0;
