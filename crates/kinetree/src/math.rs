#[cfg(feature = "libm")]
mod imp {
    pub fn acos(x: f32) -> f32 {
        libm::acosf(x)
    }
    pub fn atan2(y: f32, x: f32) -> f32 {
        libm::atan2f(y, x)
    }
    pub fn sqrt(x: f32) -> f32 {
        libm::sqrtf(x)
    }
}

#[cfg(not(feature = "libm"))]
mod imp {
    pub fn acos(x: f32) -> f32 {
        x.acos()
    }
    pub fn atan2(y: f32, x: f32) -> f32 {
        y.atan2(x)
    }
    pub fn sqrt(x: f32) -> f32 {
        x.sqrt()
    }
}

pub(crate) use imp::{acos, atan2, sqrt};

pub(crate) fn wrap_pi(angle: f32) -> f32 {
    let tau = core::f32::consts::TAU;
    let mut a = angle % tau;
    if a > core::f32::consts::PI {
        a -= tau;
    } else if a < -core::f32::consts::PI {
        a += tau;
    }
    a
}
