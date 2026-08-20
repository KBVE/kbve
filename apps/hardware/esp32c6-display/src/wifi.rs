extern crate alloc;

use embassy_net::{Runner, Stack, StackResources};
use embassy_time::{Duration, Timer};
use esp_hal::rng::Rng;
use esp_println::println;
use esp_radio::wifi::{Config, Interface, Interfaces, WifiController, sta::StationConfig};
use static_cell::StaticCell;

use crate::state::{self, Link};

pub const SSID: &str = match option_env!("WIFI_SSID") {
    Some(value) => value,
    None => "",
};

const PASSWORD: &str = match option_env!("WIFI_PASSWORD") {
    Some(value) => value,
    None => "",
};

const SOCKETS: usize = 3;
const RETRY_DELAY: Duration = Duration::from_secs(3);
const DHCP_POLL: Duration = Duration::from_millis(250);

static RESOURCES: StaticCell<StackResources<SOCKETS>> = StaticCell::new();

pub struct Wifi {
    pub controller: WifiController<'static>,
    pub stack: Stack<'static>,
    pub runner: Runner<'static, Interface<'static>>,
}

pub fn configured() -> bool {
    !SSID.is_empty()
}

pub fn init(wifi: esp_hal::peripherals::WIFI<'static>) -> Option<Wifi> {
    let (controller, interfaces) = match esp_radio::wifi::new(wifi, Default::default()) {
        Ok(parts) => parts,
        Err(e) => {
            println!("[wifi] init failed: {e:?}");
            return None;
        }
    };

    let Interfaces { station, .. } = interfaces;
    let seed = ((Rng::new().random() as u64) << 32) | Rng::new().random() as u64;

    let (stack, runner) = embassy_net::new(
        station,
        embassy_net::Config::dhcpv4(Default::default()),
        RESOURCES.init(StackResources::new()),
        seed,
    );

    Some(Wifi {
        controller,
        stack,
        runner,
    })
}

pub async fn net_task(mut runner: Runner<'static, Interface<'static>>) -> ! {
    runner.run().await
}

pub async fn connect(mut controller: WifiController<'static>, stack: Stack<'static>) -> ! {
    let station = StationConfig::default()
        .with_ssid(SSID)
        .with_password(alloc::string::String::from(PASSWORD));

    if let Err(e) = controller.set_config(&Config::Station(station)) {
        println!("[wifi] config rejected: {e:?}");
        state::set_link(Link::Failed);
        loop {
            Timer::after(Duration::from_secs(60)).await;
        }
    }

    loop {
        state::set_link(Link::Joining);
        println!("[wifi] joining {SSID}");

        match controller.connect_async().await {
            Ok(_) => println!("[wifi] associated"),
            Err(e) => {
                println!("[wifi] join failed: {e:?}");
                state::set_link(Link::Failed);
                Timer::after(RETRY_DELAY).await;
                continue;
            }
        }

        state::set_link(Link::Dhcp);
        while !stack.is_config_up() {
            Timer::after(DHCP_POLL).await;
        }

        match stack.config_v4() {
            Some(config) => {
                let ip = config.address.address().octets();
                state::set_ip(ip);
                state::set_link(Link::Up);
                println!("[wifi] ip {}.{}.{}.{}", ip[0], ip[1], ip[2], ip[3]);
            }
            None => state::set_link(Link::Up),
        }

        let _ = controller.wait_for_disconnect_async().await;
        println!("[wifi] dropped");
        state::set_link(Link::Down);
        state::set_ip([0; 4]);
        Timer::after(RETRY_DELAY).await;
    }
}
