use embassy_net::{IpEndpoint, Stack, dns::DnsQueryType, tcp::TcpSocket};
use embassy_time::{Duration, Timer};
use esp_println::println;

use crate::board::{TERM_COLS, TERM_ROWS};
use crate::state::{self, Bbs};
use crate::telnet::Telnet;

pub const HOST: &str = match option_env!("BBS_HOST") {
    Some(value) => value,
    None => "bbs.kbve.com",
};

pub const PORT: u16 = 6401;

const RX_BYTES: usize = 2048;
const TX_BYTES: usize = 512;
const IDLE_TIMEOUT: Duration = Duration::from_secs(180);
const RETRY_DELAY: Duration = Duration::from_secs(5);

pub async fn run(stack: Stack<'static>) -> ! {
    let mut rx = [0u8; RX_BYTES];
    let mut tx = [0u8; TX_BYTES];

    loop {
        stack.wait_config_up().await;

        state::set_bbs(Bbs::Resolving);
        let address = match stack.dns_query(HOST, DnsQueryType::A).await {
            Ok(found) => match found.first().copied() {
                Some(address) => address,
                None => {
                    println!("[bbs] {HOST} resolved to nothing");
                    state::set_bbs(Bbs::Failed);
                    Timer::after(RETRY_DELAY).await;
                    continue;
                }
            },
            Err(e) => {
                println!("[bbs] dns failed: {e:?}");
                state::set_bbs(Bbs::Failed);
                Timer::after(RETRY_DELAY).await;
                continue;
            }
        };

        let mut socket = TcpSocket::new(stack, &mut rx, &mut tx);
        socket.set_timeout(Some(IDLE_TIMEOUT));
        socket.set_keep_alive(Some(Duration::from_secs(30)));

        state::set_bbs(Bbs::Dialing);
        println!("[bbs] dialing {HOST}:{PORT} at {address}");

        if let Err(e) = socket.connect(IpEndpoint::new(address, PORT)).await {
            println!("[bbs] connect failed: {e:?}");
            state::set_bbs(Bbs::Failed);
            Timer::after(RETRY_DELAY).await;
            continue;
        }

        state::set_bbs(Bbs::Online);
        println!("[bbs] connected");

        let mut telnet = Telnet::new(TERM_COLS, TERM_ROWS);
        if let Err(e) = telnet.greet(&mut socket).await {
            println!("[bbs] greeting failed: {e:?}");
        }

        pump(&mut socket, &mut telnet).await;

        println!("[bbs] link closed");
        state::set_bbs(Bbs::Idle);
        socket.close();
        Timer::after(RETRY_DELAY).await;
    }
}

async fn pump(socket: &mut TcpSocket<'_>, telnet: &mut Telnet) {
    let mut chunk = [0u8; 256];
    let mut text = [0u8; 256];

    loop {
        let read = match socket.read(&mut chunk).await {
            Ok(0) => return,
            Ok(n) => n,
            Err(e) => {
                println!("[bbs] read failed: {e:?}");
                return;
            }
        };

        let produced = match telnet.feed(&chunk[..read], &mut text, socket).await {
            Ok(n) => n,
            Err(e) => {
                println!("[bbs] negotiation failed: {e:?}");
                return;
            }
        };

        if produced > 0 {
            let body = core::str::from_utf8(&text[..produced]).unwrap_or("<binary>");
            println!("[bbs] {body}");
        }
    }
}
