#![no_std]
#![no_main]

mod board;
mod ui;

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

use board::{
    BACKLIGHT_KHZ, BACKLIGHT_PCT, COLUMN_OFFSET, DRAW_BUFFER, PANEL_HEIGHT, PANEL_WIDTH,
    ROW_OFFSET, SPI_MHZ,
};

esp_bootloader_esp_idf::esp_app_desc!();

const HEARTBEAT_MS: u32 = 1000;

#[main]
fn main() -> ! {
    let peripherals = esp_hal::init(esp_hal::Config::default().with_cpu_clock(CpuClock::_80MHz));
    let mut delay = Delay::new();

    println!("[c6] booting");

    let mut ledc = Ledc::new(peripherals.LEDC);
    ledc.set_global_slow_clock(LSGlobalClkSource::APBClk);
    let mut backlight_timer = ledc.timer::<LowSpeed>(timer::Number::Timer0);
    backlight_timer
        .configure(timer::config::Config {
            duty: timer::config::Duty::Duty8Bit,
            clock_source: timer::LSClockSource::APBClk,
            frequency: Rate::from_khz(BACKLIGHT_KHZ),
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
            .with_frequency(Rate::from_mhz(SPI_MHZ))
            .with_mode(Mode::_0),
    )
    .expect("spi")
    .with_sck(peripherals.GPIO7)
    .with_mosi(peripherals.GPIO6);

    let cs = Output::new(peripherals.GPIO14, Level::High, OutputConfig::default());
    let dc = Output::new(peripherals.GPIO15, Level::Low, OutputConfig::default());
    let reset = Output::new(peripherals.GPIO21, Level::High, OutputConfig::default());

    let spi_device = ExclusiveDevice::new(spi, cs, delay).expect("spi device");

    let mut buffer = [0u8; DRAW_BUFFER];
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

    ui::splash(&mut display).expect("splash");

    println!("[c6] drew first frame");

    let tsens = TemperatureSensor::new(peripherals.TSENS, TsensConfig::default()).ok();

    let mut ticks: u32 = 0;
    loop {
        delay.delay_millis(HEARTBEAT_MS);
        ticks += 1;
        match tsens.as_ref() {
            Some(sensor) => {
                let decicelsius = (sensor.get_temperature().to_celsius() * 10.0) as i32;
                println!(
                    "[c6] alive {ticks}s die {}.{}C",
                    decicelsius / 10,
                    (decicelsius % 10).abs()
                );
            }
            None => println!("[c6] alive {ticks}s"),
        }
    }
}
