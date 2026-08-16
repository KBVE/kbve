#![no_std]
#![no_main]

use embedded_graphics::{
    mono_font::{MonoTextStyle, ascii::FONT_10X20},
    pixelcolor::Rgb565,
    prelude::*,
    primitives::{PrimitiveStyle, Rectangle},
    text::Text,
};
use embedded_hal_bus::spi::ExclusiveDevice;
use esp_backtrace as _;
use esp_hal::{
    clock::CpuClock,
    delay::Delay,
    gpio::{DriveMode, Level, Output, OutputConfig},
    ledc::{
        LSGlobalClkSource, Ledc, LowSpeed,
        channel::{self, ChannelIFace},
        timer::{self, TimerIFace},
    },
    main,
    spi::{
        Mode,
        master::{Config as SpiConfig, Spi},
    },
    time::Rate,
    tsens::{Config as TsensConfig, TemperatureSensor},
};
use esp_println::println;
use mipidsi::{
    Builder,
    interface::SpiInterface,
    models::ST7789,
    options::{ColorInversion, Orientation, Rotation},
};

esp_bootloader_esp_idf::esp_app_desc!();

/// The panel is a 172x320 window on a 240x320 ST7789, centred horizontally,
/// so every write is shifted by (240 - 172) / 2 columns. Without this the
/// image is offset and the right edge wraps.
const PANEL_WIDTH: u16 = 172;
const PANEL_HEIGHT: u16 = 320;
const COLUMN_OFFSET: u16 = (240 - PANEL_WIDTH) / 2;
const ROW_OFFSET: u16 = 0;

/// Comfortably readable indoors, and the single biggest lever on how warm the
/// board runs.
const BACKLIGHT_PCT: u8 = 40;

#[main]
fn main() -> ! {
    let peripherals = esp_hal::init(esp_hal::Config::default().with_cpu_clock(CpuClock::max()));
    let mut delay = Delay::new();

    println!("[c6] booting");

    // Backlight on LEDC rather than a bare GPIO. Held fully on it is the
    // largest heat source on the board by a wide margin — measured at roughly
    // +5C on the die, against +0.7C for doubling the CPU clock — and full
    // brightness is not needed indoors.
    let mut ledc = Ledc::new(peripherals.LEDC);
    ledc.set_global_slow_clock(LSGlobalClkSource::APBClk);
    let mut backlight_timer = ledc.timer::<LowSpeed>(timer::Number::Timer0);
    backlight_timer
        .configure(timer::config::Config {
            duty: timer::config::Duty::Duty8Bit,
            clock_source: timer::LSClockSource::APBClk,
            frequency: Rate::from_khz(5),
        })
        .expect("backlight timer");

    let mut backlight = ledc.channel(channel::Number::Channel0, peripherals.GPIO22);
    backlight
        .configure(channel::config::Config {
            timer: &backlight_timer,
            duty_pct: BACKLIGHT_PCT,
            drive_mode: DriveMode::PushPull,
        })
        .expect("backlight channel");

    let spi = Spi::new(
        peripherals.SPI2,
        SpiConfig::default()
            .with_frequency(Rate::from_mhz(40))
            .with_mode(Mode::_0),
    )
    .expect("spi")
    .with_sck(peripherals.GPIO7)
    .with_mosi(peripherals.GPIO6);

    let cs = Output::new(peripherals.GPIO14, Level::High, OutputConfig::default());
    let dc = Output::new(peripherals.GPIO15, Level::Low, OutputConfig::default());
    let reset = Output::new(peripherals.GPIO21, Level::High, OutputConfig::default());

    let spi_device = ExclusiveDevice::new(spi, cs, delay).expect("spi device");

    let mut buffer = [0u8; 512];
    let di = SpiInterface::new(spi_device, dc, &mut buffer);

    let mut display = Builder::new(ST7789, di)
        .reset_pin(reset)
        .display_size(PANEL_WIDTH, PANEL_HEIGHT)
        .display_offset(COLUMN_OFFSET, ROW_OFFSET)
        .invert_colors(ColorInversion::Inverted)
        .orientation(Orientation::new().rotate(Rotation::Deg0))
        .init(&mut delay)
        .expect("display init");

    println!("[c6] display up: {PANEL_WIDTH}x{PANEL_HEIGHT}");

    display.clear(Rgb565::BLACK).expect("clear");

    Rectangle::new(Point::new(0, 0), Size::new(PANEL_WIDTH as u32, 28))
        .into_styled(PrimitiveStyle::with_fill(Rgb565::CSS_DARK_SLATE_BLUE))
        .draw(&mut display)
        .expect("banner");

    // Centred by hand: the font is fixed-pitch, so the width is just the glyph
    // count times the cell, and the panel is narrow enough that being a few
    // pixels off reads as crooked.
    let heading = MonoTextStyle::new(&FONT_10X20, Rgb565::WHITE);
    let title = "K B V E";
    let title_x = (PANEL_WIDTH as i32 - (title.len() as i32 * 10)) / 2;
    Text::new(title, Point::new(title_x, 20), heading)
        .draw(&mut display)
        .expect("heading");

    let body = MonoTextStyle::new(&FONT_10X20, Rgb565::CSS_LIGHT_GREEN);
    Text::new("esp32-c6", Point::new(8, 60), body)
        .draw(&mut display)
        .expect("chip");
    Text::new("172x320", Point::new(8, 84), body)
        .draw(&mut display)
        .expect("size");

    println!("[c6] drew first frame");

    let tsens = TemperatureSensor::new(peripherals.TSENS, TsensConfig::default()).ok();

    let mut ticks: u32 = 0;
    loop {
        delay.delay_millis(1000);
        ticks += 1;
        match tsens.as_ref() {
            Some(sensor) => {
                let c = sensor.get_temperature().to_celsius();
                println!("[c6] alive {ticks}s die {c}C");
            }
            None => println!("[c6] alive {ticks}s"),
        }
    }
}
