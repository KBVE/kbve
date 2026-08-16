#![allow(clippy::needless_borrows_for_generic_args)]

use bt_hci::controller::ExternalController;
use embassy_futures::{join::join, select::select};
use embassy_time::{Duration, Timer};
use esp_radio::ble::controller::BleConnector;
use esp_println::println;
use trouble_host::prelude::*;

use crate::state;

pub const DEVICE_NAME: &str = "KBVE-C6";

const CONNECTIONS_MAX: usize = 1;
const L2CAP_CHANNELS_MAX: usize = 2;
const SLOTS: usize = 20;
const NOTIFY_PERIOD: Duration = Duration::from_secs(2);

#[gatt_server]
pub struct Server {
    pub board: BoardService,
}


#[gatt_service(uuid = "6b76e000-4b0f-4c0e-9d3a-9b7e0c1a5a01")]
pub struct BoardService {
    #[characteristic(uuid = "6b76e001-4b0f-4c0e-9d3a-9b7e0c1a5a01", read, notify)]
    pub die_decicelsius: i16,

    #[characteristic(uuid = "6b76e002-4b0f-4c0e-9d3a-9b7e0c1a5a01", read, notify)]
    pub uptime: u32,

    #[characteristic(uuid = "6b76e003-4b0f-4c0e-9d3a-9b7e0c1a5a01", read, notify)]
    pub presses: u32,

    #[characteristic(uuid = "6b76e004-4b0f-4c0e-9d3a-9b7e0c1a5a01", read, write)]
    pub backlight: u8,
}

pub async fn run(connector: BleConnector<'static>) -> ! {
    let controller: ExternalController<_, SLOTS> = ExternalController::new(connector);
    let address = Address::random([0xC6, 0x0F, 0x4B, 0x76, 0x6B, 0xE1]);

    let mut resources: HostResources<DefaultPacketPool, CONNECTIONS_MAX, L2CAP_CHANNELS_MAX> =
        HostResources::new();
    let stack = trouble_host::new(controller, &mut resources).set_random_address(address);
    let Host {
        mut peripheral,
        runner,
        ..
    } = stack.build();

    let server = match Server::new_with_config(GapConfig::Peripheral(PeripheralConfig {
        name: DEVICE_NAME,
        appearance: &appearance::sensor::GENERIC_SENSOR,
    })) {
        Ok(server) => server,
        Err(e) => {
            println!("[ble] server build failed: {e:?}");
            loop {
                Timer::after(Duration::from_secs(60)).await;
            }
        }
    };

    println!("[ble] advertising as {DEVICE_NAME}");

    let _ = join(ble_task(runner), async {
        loop {
            match advertise(DEVICE_NAME, &mut peripheral, &server).await {
                Ok(conn) => {
                    state::set_linked(true);
                    println!("[ble] connected");
                    let _ = select(gatt_events(&server, &conn), notify_loop(&server, &conn)).await;
                    state::set_linked(false);
                    println!("[ble] disconnected");
                }
                Err(e) => {
                    println!("[ble] advertise failed: {e:?}");
                    Timer::after(Duration::from_secs(1)).await;
                }
            }
        }
    })
    .await;

    loop {
        Timer::after(Duration::from_secs(60)).await;
    }
}

async fn ble_task<C: Controller, P: PacketPool>(mut runner: Runner<'_, C, P>) {
    loop {
        if let Err(e) = runner.run().await {
            println!("[ble] runner stopped: {e:?}");
            Timer::after(Duration::from_secs(1)).await;
        }
    }
}

async fn advertise<'a, C: Controller>(
    name: &'a str,
    peripheral: &mut Peripheral<'a, C, DefaultPacketPool>,
    server: &'a Server<'_>,
) -> Result<GattConnection<'a, 'a, DefaultPacketPool>, BleHostError<C::Error>> {
    let mut advertiser_data = [0; 31];
    let len = AdStructure::encode_slice(
        &[
            AdStructure::Flags(LE_GENERAL_DISCOVERABLE | BR_EDR_NOT_SUPPORTED),
            AdStructure::CompleteLocalName(name.as_bytes()),
        ],
        &mut advertiser_data[..],
    )?;

    let advertiser = peripheral
        .advertise(
            &Default::default(),
            Advertisement::ConnectableScannableUndirected {
                adv_data: &advertiser_data[..len],
                scan_data: &[],
            },
        )
        .await?;

    let conn = advertiser.accept().await?.with_attribute_server(server)?;
    Ok(conn)
}

async fn gatt_events(server: &Server<'_>, conn: &GattConnection<'_, '_, DefaultPacketPool>) {
    let backlight = server.board.backlight;

    loop {
        match conn.next().await {
            GattConnectionEvent::Disconnected { reason } => {
                println!("[ble] link closed: {reason:?}");
                return;
            }
            GattConnectionEvent::Gatt { event } => {
                if let GattEvent::Write(write) = &event {
                    if write.handle() == backlight.handle {
                        if let Some(pct) = write.data().first().copied() {
                            println!("[ble] backlight request {pct}%");
                            state::request_backlight(pct);
                        }
                    }
                }
                if let Err(e) = event.accept().map(|reply| reply.send()) {
                    println!("[ble] reply failed: {e:?}");
                }
            }
            _ => {}
        }
    }
}

async fn notify_loop(server: &Server<'_>, conn: &GattConnection<'_, '_, DefaultPacketPool>) {
    loop {
        Timer::after(NOTIFY_PERIOD).await;

        let board = &server.board;
        let _ = board.die_decicelsius.notify(conn, &state::die()).await;
        let _ = board.uptime.notify(conn, &state::uptime()).await;
        let _ = board.presses.notify(conn, &state::presses()).await;
        let _ = board.backlight.notify(conn, &state::backlight()).await;
    }
}
