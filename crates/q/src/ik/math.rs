//! Rigid transforms and the small dense solve the IK step needs.

/// Column-major 3x3 rotation, stored as three basis vectors.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Mat3 {
    pub x: [f32; 3],
    pub y: [f32; 3],
    pub z: [f32; 3],
}

impl Mat3 {
    pub const IDENTITY: Self = Self {
        x: [1.0, 0.0, 0.0],
        y: [0.0, 1.0, 0.0],
        z: [0.0, 0.0, 1.0],
    };

    /// Right-handed rotation of `angle` radians about a unit `axis`.
    pub fn from_axis_angle(axis: [f32; 3], angle: f32) -> Self {
        let a = normalize(axis);
        let (s, c) = angle.sin_cos();
        let t = 1.0 - c;
        Self {
            x: [
                t * a[0] * a[0] + c,
                t * a[0] * a[1] + s * a[2],
                t * a[0] * a[2] - s * a[1],
            ],
            y: [
                t * a[0] * a[1] - s * a[2],
                t * a[1] * a[1] + c,
                t * a[1] * a[2] + s * a[0],
            ],
            z: [
                t * a[0] * a[2] + s * a[1],
                t * a[1] * a[2] - s * a[0],
                t * a[2] * a[2] + c,
            ],
        }
    }

    pub fn mul(&self, rhs: &Self) -> Self {
        Self {
            x: self.rotate(rhs.x),
            y: self.rotate(rhs.y),
            z: self.rotate(rhs.z),
        }
    }

    pub fn rotate(&self, v: [f32; 3]) -> [f32; 3] {
        [
            self.x[0] * v[0] + self.y[0] * v[1] + self.z[0] * v[2],
            self.x[1] * v[0] + self.y[1] * v[1] + self.z[1] * v[2],
            self.x[2] * v[0] + self.y[2] * v[1] + self.z[2] * v[2],
        ]
    }

    pub fn transpose(&self) -> Self {
        Self {
            x: [self.x[0], self.y[0], self.z[0]],
            y: [self.x[1], self.y[1], self.z[1]],
            z: [self.x[2], self.y[2], self.z[2]],
        }
    }

    /// Axis-angle of this rotation as a single vector, magnitude in radians.
    pub fn to_rotation_vector(&self) -> [f32; 3] {
        let trace = self.x[0] + self.y[1] + self.z[2];
        let cos = ((trace - 1.0) * 0.5).clamp(-1.0, 1.0);
        let angle = cos.acos();
        if angle < 1e-6 {
            return [0.0; 3];
        }
        // Near pi the off-diagonal difference collapses, so the axis comes from
        // the largest diagonal term instead.
        if angle > std::f32::consts::PI - 1e-3 {
            let d = [
                (self.x[0] + 1.0) * 0.5,
                (self.y[1] + 1.0) * 0.5,
                (self.z[2] + 1.0) * 0.5,
            ];
            let i = if d[0] >= d[1] && d[0] >= d[2] {
                0
            } else if d[1] >= d[2] {
                1
            } else {
                2
            };
            let mut axis = [0.0f32; 3];
            axis[i] = d[i].max(0.0).sqrt();
            let (a, b) = match i {
                0 => (self.y[0], self.z[0]),
                1 => (self.x[1], self.z[1]),
                _ => (self.x[2], self.y[2]),
            };
            let other = [(i + 1) % 3, (i + 2) % 3];
            if axis[i] > 1e-6 {
                axis[other[0]] = a * 0.5 / axis[i];
                axis[other[1]] = b * 0.5 / axis[i];
            }
            return scale(normalize(axis), angle);
        }
        let k = angle / (2.0 * angle.sin());
        [
            (self.y[2] - self.z[1]) * k,
            (self.z[0] - self.x[2]) * k,
            (self.x[1] - self.y[0]) * k,
        ]
    }
}

/// Rotation and translation. No scale: bones do not stretch here.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Xform {
    pub basis: Mat3,
    pub origin: [f32; 3],
}

impl Xform {
    pub const IDENTITY: Self = Self {
        basis: Mat3::IDENTITY,
        origin: [0.0; 3],
    };

    pub fn from_origin(origin: [f32; 3]) -> Self {
        Self {
            basis: Mat3::IDENTITY,
            origin,
        }
    }

    pub fn mul(&self, rhs: &Self) -> Self {
        Self {
            basis: self.basis.mul(&rhs.basis),
            origin: add(self.origin, self.basis.rotate(rhs.origin)),
        }
    }
}

pub fn add(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

pub fn sub(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

pub fn scale(v: [f32; 3], k: f32) -> [f32; 3] {
    [v[0] * k, v[1] * k, v[2] * k]
}

pub fn cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

pub fn length(v: [f32; 3]) -> f32 {
    (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt()
}

pub fn normalize(v: [f32; 3]) -> [f32; 3] {
    let len = length(v);
    if len < 1e-9 {
        [0.0, 0.0, 1.0]
    } else {
        scale(v, 1.0 / len)
    }
}

/// Solves `(a + lambda^2 I) x = b` for symmetric positive-definite `a`, in place.
///
/// Cholesky rather than SVD: the normal-equations matrix is degrees-of-freedom
/// square and small, and the damping term is what keeps it conditioned.
/// Returns false if the factorisation hits a non-positive pivot.
pub fn solve_spd(a: &mut [f32], b: &mut [f32], n: usize, lambda: f32) -> bool {
    let l2 = lambda * lambda;
    for i in 0..n {
        a[i * n + i] += l2;
    }
    for i in 0..n {
        for j in 0..=i {
            let mut sum = a[i * n + j];
            for k in 0..j {
                sum -= a[i * n + k] * a[j * n + k];
            }
            if i == j {
                if sum <= 1e-12 {
                    return false;
                }
                a[i * n + i] = sum.sqrt();
            } else {
                a[i * n + j] = sum / a[j * n + j];
            }
        }
    }
    for i in 0..n {
        let mut sum = b[i];
        for k in 0..i {
            sum -= a[i * n + k] * b[k];
        }
        b[i] = sum / a[i * n + i];
    }
    for i in (0..n).rev() {
        let mut sum = b[i];
        for k in (i + 1)..n {
            sum -= a[k * n + i] * b[k];
        }
        b[i] = sum / a[i * n + i];
    }
    true
}
