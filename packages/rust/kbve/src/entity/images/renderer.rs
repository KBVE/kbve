//! SVG-to-PNG rendering pipeline.
//!
//! Provides [`FontDb`] for one-time font loading at startup and
//! [`render_svg_to_png`] / [`render_svg_to_png_scaled`] for rasterizing
//! SVG strings into PNG byte buffers.
//!
//! Gated behind the `image-gen` feature.
//!
//! # Example
//!
//! ```ignore
//! let mut fontdb = FontDb::new();
//! fontdb.load_font_file("alagard.ttf").unwrap();
//! let png = render_svg_to_png("<svg>...</svg>", &fontdb).unwrap();
//! ```

use std::path::Path;
use std::sync::Arc;

use resvg::tiny_skia;
use resvg::usvg;

/// Wrapper around the resvg font database.
///
/// Load fonts once at startup and share via `Arc<FontDb>` across tasks.
#[derive(Clone)]
pub struct FontDb {
    inner: Arc<usvg::fontdb::Database>,
}

impl FontDb {
    /// Create an empty font database.
    pub fn new() -> Self {
        Self {
            inner: Arc::new(usvg::fontdb::Database::new()),
        }
    }

    /// Load a TrueType or OpenType font file.
    pub fn load_font_file<P: AsRef<Path>>(&mut self, path: P) -> Result<(), RenderError> {
        let db = Arc::get_mut(&mut self.inner).ok_or_else(|| {
            RenderError::Font("FontDb is shared; load fonts before cloning".into())
        })?;
        db.load_font_file(path.as_ref())
            .map_err(|e| RenderError::Font(format!("Failed to load font: {e}")))?;
        Ok(())
    }

    /// Load system-installed fonts as fallback.
    pub fn load_system_fonts(&mut self) {
        if let Some(db) = Arc::get_mut(&mut self.inner) {
            db.load_system_fonts();
        }
    }

    /// Return the number of loaded font faces.
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// Return `true` if no fonts are loaded.
    pub fn is_empty(&self) -> bool {
        self.inner.len() == 0
    }

    /// Access the inner font database arc for embedding into Options.
    pub fn database_arc(&self) -> Arc<usvg::fontdb::Database> {
        self.inner.clone()
    }
}

impl Default for FontDb {
    fn default() -> Self {
        Self::new()
    }
}

/// Errors that can occur during SVG-to-PNG rendering.
#[derive(Debug, thiserror::Error)]
pub enum RenderError {
    #[error("SVG parse error: {0}")]
    SvgParse(String),

    #[error("Pixmap creation failed (invalid dimensions)")]
    Pixmap,

    #[error("PNG encoding error: {0}")]
    PngEncode(String),

    #[error("Font error: {0}")]
    Font(String),
}

/// Render an SVG string to PNG bytes at native resolution.
///
/// This is CPU-bound (~5-40ms for an 800x400 image). Call from
/// `tokio::task::spawn_blocking` in async contexts.
pub fn render_svg_to_png(svg: &str, fontdb: &FontDb) -> Result<Vec<u8>, RenderError> {
    render_svg_to_png_scaled(svg, fontdb, 1.0)
}

/// Render an SVG string to PNG bytes with a scale factor.
///
/// A `scale` of `2.0` produces a 2x resolution image (e.g., 1600x800
/// from an 800x400 SVG viewBox), useful for high-DPI displays.
pub fn render_svg_to_png_scaled(
    svg: &str,
    fontdb: &FontDb,
    scale: f32,
) -> Result<Vec<u8>, RenderError> {
    let mut options = usvg::Options {
        font_family: "Alagard".to_owned(),
        ..Default::default()
    };
    options.fontdb = fontdb.database_arc();

    let tree =
        usvg::Tree::from_str(svg, &options).map_err(|e| RenderError::SvgParse(e.to_string()))?;

    let size = tree.size();
    let width = (size.width() * scale).ceil() as u32;
    let height = (size.height() * scale).ceil() as u32;

    let mut pixmap = tiny_skia::Pixmap::new(width, height).ok_or(RenderError::Pixmap)?;

    let transform = tiny_skia::Transform::from_scale(scale, scale);
    resvg::render(&tree, transform, &mut pixmap.as_mut());

    pixmap
        .encode_png()
        .map_err(|e| RenderError::PngEncode(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_svg() -> &'static str {
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50">
            <rect width="100" height="50" fill="#1a1a2e"/>
            <text x="10" y="30" font-size="14" fill="white">Test</text>
        </svg>"##
    }

    #[test]
    fn render_minimal_svg() {
        let fontdb = FontDb::new();
        let png = render_svg_to_png(minimal_svg(), &fontdb).unwrap();
        assert!(!png.is_empty());
        // PNG magic bytes
        assert_eq!(&png[0..4], &[0x89, 0x50, 0x4E, 0x47]);
    }

    #[test]
    fn render_scaled() {
        let fontdb = FontDb::new();
        let png_1x = render_svg_to_png(minimal_svg(), &fontdb).unwrap();
        let png_2x = render_svg_to_png_scaled(minimal_svg(), &fontdb, 2.0).unwrap();
        // 2x should produce more bytes
        assert!(png_2x.len() > png_1x.len());
    }

    #[test]
    fn render_invalid_svg() {
        let fontdb = FontDb::new();
        let result = render_svg_to_png("not valid svg", &fontdb);
        assert!(result.is_err());
    }

    #[test]
    fn fontdb_default() {
        let _db = FontDb::default();
    }
}
