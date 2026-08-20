use embedded_graphics::{
    mono_font::{MonoTextStyle, ascii::FONT_10X20},
    pixelcolor::Rgb565,
    prelude::*,
    primitives::{PrimitiveStyle, Rectangle},
    text::Text,
};

use crate::board::PANEL_WIDTH;
use crate::state::{Bbs, Link};

const HEADER_HEIGHT: u32 = 28;
const GLYPH_WIDTH: i32 = 10;
const BASELINE: i32 = 20;
const MARGIN: i32 = 8;
const LINE_HEIGHT: i32 = 24;
const ROW_Y: i32 = HEADER_HEIGHT as i32 + LINE_HEIGHT * 3;

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

pub fn backlight_row<D>(target: &mut D, pct: u8, presses: u32) -> Result<(), D::Error>
where
    D: DrawTarget<Color = Rgb565>,
{
    let mut text = [b' '; 16];
    let written = render_row(&mut text, pct, presses);

    Rectangle::new(
        Point::new(0, ROW_Y - LINE_HEIGHT),
        Size::new(PANEL_WIDTH as u32, LINE_HEIGHT as u32 + 8),
    )
    .into_styled(PrimitiveStyle::with_fill(Rgb565::BLACK))
    .draw(target)?;

    Text::new(
        written,
        Point::new(MARGIN, ROW_Y),
        MonoTextStyle::new(&FONT_10X20, Rgb565::CSS_ORANGE),
    )
    .draw(target)?;

    Ok(())
}

fn render_row(buffer: &mut [u8; 16], pct: u8, presses: u32) -> &str {
    let mut at = 0;
    at += write_u32(&mut buffer[at..], pct as u32);
    buffer[at] = b'%';
    at += 1;
    buffer[at] = b' ';
    at += 1;
    buffer[at] = b'x';
    at += 1;
    at += write_u32(&mut buffer[at..], presses);

    core::str::from_utf8(&buffer[..at]).unwrap_or("?")
}

fn write_u32(out: &mut [u8], mut value: u32) -> usize {
    let mut digits = [0u8; 10];
    let mut count = 0;
    loop {
        digits[count] = b'0' + (value % 10) as u8;
        count += 1;
        value /= 10;
        if value == 0 {
            break;
        }
    }
    for i in 0..count {
        out[i] = digits[count - 1 - i];
    }
    count
}

const NET_Y: i32 = ROW_Y + LINE_HEIGHT;

pub fn net_rows<D>(target: &mut D, link: Link, bbs: Bbs, ip: [u8; 4]) -> Result<(), D::Error>
where
    D: DrawTarget<Color = Rgb565>,
{
    Rectangle::new(
        Point::new(0, NET_Y - LINE_HEIGHT),
        Size::new(PANEL_WIDTH as u32, LINE_HEIGHT as u32 * 3),
    )
    .into_styled(PrimitiveStyle::with_fill(Rgb565::BLACK))
    .draw(target)?;

    let link_ink = match link {
        Link::Up => Rgb565::CSS_LIGHT_GREEN,
        Link::Failed => Rgb565::CSS_ORANGE_RED,
        _ => Rgb565::CSS_GOLD,
    };
    let bbs_ink = match bbs {
        Bbs::Online => Rgb565::CSS_LIGHT_GREEN,
        Bbs::Failed => Rgb565::CSS_ORANGE_RED,
        _ => Rgb565::CSS_GOLD,
    };

    Text::new(
        link.label(),
        Point::new(MARGIN, NET_Y),
        MonoTextStyle::new(&FONT_10X20, link_ink),
    )
    .draw(target)?;

    Text::new(
        bbs.label(),
        Point::new(MARGIN, NET_Y + LINE_HEIGHT),
        MonoTextStyle::new(&FONT_10X20, bbs_ink),
    )
    .draw(target)?;

    if ip != [0; 4] {
        let mut buffer = [0u8; 16];
        let text = render_ip(&mut buffer, ip);
        Text::new(
            text,
            Point::new(MARGIN, NET_Y + LINE_HEIGHT * 2),
            MonoTextStyle::new(&FONT_10X20, Rgb565::CSS_LIGHT_SKY_BLUE),
        )
        .draw(target)?;
    }

    Ok(())
}

fn render_ip(buffer: &mut [u8; 16], ip: [u8; 4]) -> &str {
    let mut at = 0;
    for (index, octet) in ip.iter().enumerate() {
        if index > 0 {
            buffer[at] = b'.';
            at += 1;
        }
        at += write_u32(&mut buffer[at..], *octet as u32);
    }
    core::str::from_utf8(&buffer[..at]).unwrap_or("?")
}
