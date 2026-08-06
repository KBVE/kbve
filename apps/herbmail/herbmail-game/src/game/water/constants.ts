export const SURFACE_DROP = 1.0;
export const OASIS_DEPTH = 5.2;
export const SWIM_SINK = 1.15;
export const OASIS_ACTIVE_RADIUS = 34;
export const OASIS_VISIBLE_RADIUS = 50;
export const OASIS_CORNER_RADIUS = 1.2;

// Wave-surface grid resolution. The vendored default of 200 builds an 80k-tri
// plane per surface, and a visible oasis carries two (above + below), so one
// pool cost 160k triangles — more than half the frame at spawn and far past
// what the PSX look needs. Raise if the wave silhouette reads too faceted.
export const WATER_SURFACE_SEGMENTS = 64;

// Caustics render into their own 1024 target and their grid density drives the
// caustic pattern detail, not the scene triangle count. Left at the vendored
// density until the coarser value can be compared on real hardware.
export const CAUSTICS_SEGMENTS = 200;
