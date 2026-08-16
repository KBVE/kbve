#![no_std]
#![no_main]

mod ble;
mod board;
mod input;
mod state;
mod ui;

extern crate alloc;

use embedded_hal_bus::spi::ExclusiveDevice;
use esp_backtrace as _;
use esp_hal::{
    clock::CpuClock,
    delay::Delay,
    gpio::{DriveMode, Input, InputConfig, Level, Output, OutputConfig, Pull},
    ledc::{
        LSGlobalClkSource, Ledc, LowSpeed,
        channel::{self, ChannelIFace},
        timer::{self, TimerIFace},
    },

    interrupt::software::SoftwareInterruptControl,
    timer::timg::TimerGroup,
    spi::{
        Mode,
        master::{Config as SpiConfig, Spi},
    },
    time::Rate,
    tsens::{Config as TsensConfig, TemperatureSensor},
};
use embassy_executor::Spawner;
use embassy_time::{Duration, Timer};
use esp_println::println;
use esp_radio::ble::controller::BleConnector;
use mipidsi::{
    Builder,
    interface::SpiInterface,
    models::ST7789,
    options::{ColorInversion, Orientation, Rotation},
};

use board::{
    BACKLIGHT_KHZ, BACKLIGHT_PCT, BACKLIGHT_STEPS, COLUMN_OFFSET, DRAW_BUFFER, HEARTBEAT_TICKS,
    DEBOUNCE_SAMPLES, LONG_PRESS_TICKS, PANEL_HEIGHT, PANEL_WIDTH, POLL_MS, ROW_OFFSET,
    SETTLE_TICKS, SPI_MHZ,
};
use input::{Button, Press};

esp_bootloader_esp_idf::esp_app_desc!();

const HEAP_BYTES: usize = 72 * 1024;

#[embassy_executor::task]
async fn radio(connector: BleConnector<'static>) {
    ble::run(connector).await
}


#[esp_rtos::main]
async fn main(spawner: Spawner) {
    let peripherals = esp_hal::init(esp_hal::Config::default().with_cpu_clock(CpuClock::_80MHz));
    let mut delay = Delay::new();

    esp_alloc::heap_allocator!(size: HEAP_BYTES);

    let timg0 = TimerGroup::new(peripherals.TIMG0);
    let sw_ints = SoftwareInterruptControl::new(peripherals.SW_INTERRUPT);
    esp_rtos::start(timg0.timer0, sw_ints.software_interrupt0);

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

    match BleConnector::new(peripherals.BT, Default::default()) {
        Ok(connector) => {
            match radio(connector) {
                Ok(token) => spawner.spawn(token),
                Err(e) => println!("[ble] spawn failed: {e:?}"),
            }
        }
        Err(e) => println!("[ble] connector failed: {e:?}"),
    }

    let mut button = Button::new(
        Input::new(peripherals.GPIO9, InputConfig::default().with_pull(Pull::Up)),
        DEBOUNCE_SAMPLES,
        LONG_PRESS_TICKS,
        SETTLE_TICKS,
    );

    let mut step = BACKLIGHT_STEPS
        .iter()
        .position(|pct| *pct == BACKLIGHT_PCT)
        .unwrap_or(0);
    let mut presses: u32 = 0;
    let mut blanked = false;
    ui::backlight_row(&mut display, BACKLIGHT_STEPS[step], presses).expect("row");

    let mut ticks: u32 = 0;
    loop {
        Timer::after(Duration::from_millis(POLL_MS as u64)).await;
        ticks += 1;

        match button.poll() {
            Some(Press::Short) => {
                presses += 1;
                blanked = false;
                step = (step + 1) % BACKLIGHT_STEPS.len();
                let pct = BACKLIGHT_STEPS[step];
                backlight.set_duty(pct).expect("duty");
                state::publish_backlight(pct);
                state::set_presses(presses);
                ui::backlight_row(&mut display, pct, presses).expect("row");
                println!("[c6] short press {presses} backlight {pct}%");
            }
            Some(Press::Long) => {
                blanked = !blanked;
                let pct = if blanked { 0 } else { BACKLIGHT_STEPS[step] };
                backlight.set_duty(pct).expect("duty");
                println!("[c6] long press blanked {blanked}");
            }
            None => {}
        }

        if let Some(pct) = state::take_backlight_request() {
            blanked = pct == 0;
            step = nearest_step(pct);
            backlight.set_duty(pct).expect("duty");
            ui::backlight_row(&mut display, pct, presses).expect("row");
            println!("[c6] remote backlight {pct}%");
        }

        if !ticks.is_multiple_of(HEARTBEAT_TICKS) {
            continue;
        }

        let seconds = ticks / HEARTBEAT_TICKS;
        state::set_uptime(seconds);
        match tsens.as_ref() {
            Some(sensor) => {
                let decicelsius = (sensor.get_temperature().to_celsius() * 10.0) as i32;
                state::set_die(decicelsius as i16);
                println!(
                    "[c6] alive {seconds}s die {}.{}C link {}",
                    decicelsius / 10,
                    (decicelsius % 10).abs(),
                    state::linked()
                );
            }
            None => println!("[c6] alive {seconds}s"),
        }
    }
}

fn nearest_step(pct: u8) -> usize {
    let mut best = 0;
    let mut best_gap = u8::MAX;
    for (i, step) in BACKLIGHT_STEPS.iter().enumerate() {
        let gap = step.abs_diff(pct);
        if gap < best_gap {
            best_gap = gap;
            best = i;
        }
    }
    best
}
