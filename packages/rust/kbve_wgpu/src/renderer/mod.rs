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

pub trait SurfaceRenderer {
    fn resize(&mut self, width: u32, height: u32);
    fn render(&mut self) -> Result<(), wgpu::SurfaceError>;
    fn input(&mut self, _event: InputEvent) {}
    fn set_jwt(&mut self, _jwt: &str) {}
    fn set_paused(&mut self, _paused: bool) {}
}
