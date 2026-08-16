use embedded_graphics::{
    mono_font::{MonoTextStyle, ascii::FONT_10X20},
    pixelcolor::Rgb565,
    prelude::*,
    primitives::{PrimitiveStyle, Rectangle},
    text::Text,
};

use crate::board::PANEL_WIDTH;

const HEADER_HEIGHT: u32 = 28;
const GLYPH_WIDTH: i32 = 10;
const BASELINE: i32 = 20;
const MARGIN: i32 = 8;
const LINE_HEIGHT: i32 = 24;

fn centred(text: &str) -> i32 {
    (PANEL_WIDTH as i32 - text.len() as i32 * GLYPH_WIDTH) / 2
}

pub fn splash<D>(target: &mut D) -> Result<(), D::Error>
where
    D: DrawTarget<Color = Rgb565>,
{
    target.clear(Rgb565::BLACK)?;

    Rectangle::new(Point::zero(), Size::new(PANEL_WIDTH as u32, HEADER_HEIGHT))
        .into_styled(PrimitiveStyle::with_fill(Rgb565::CSS_DARK_SLATE_BLUE))
        .draw(target)?;

    let title = "K B V E";
    Text::new(
        title,
        Point::new(centred(title), BASELINE),
        MonoTextStyle::new(&FONT_10X20, Rgb565::WHITE),
    )
    .draw(target)?;

    let body = MonoTextStyle::new(&FONT_10X20, Rgb565::CSS_LIGHT_GREEN);
    let mut y = HEADER_HEIGHT as i32 + LINE_HEIGHT;
    for line in ["esp32-c6", "172x320"] {
        Text::new(line, Point::new(MARGIN, y), body).draw(target)?;
        y += LINE_HEIGHT;
    }

    Ok(())
}
