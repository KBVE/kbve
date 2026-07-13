pub mod triangle;

#[cfg(feature = "bevy")]
pub mod bevy;

#[derive(Clone, Copy, Debug)]
pub struct InputEvent {
    pub kind: u32,
    pub x: f32,
    pub y: f32,
    pub id: u32,
}

#[derive(Debug)]
pub enum RenderError {
    SurfaceLost,
    Other(String),
}

impl std::fmt::Display for RenderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RenderError::SurfaceLost => write!(f, "surface lost"),
            RenderError::Other(msg) => write!(f, "{msg}"),
        }
    }
}

pub trait SurfaceRenderer {
    fn resize(&mut self, width: u32, height: u32);
    fn render(&mut self) -> Result<(), RenderError>;
    fn input(&mut self, _event: InputEvent) {}
    fn set_jwt(&mut self, _jwt: &str) {}
    fn set_paused(&mut self, _paused: bool) {}
}
