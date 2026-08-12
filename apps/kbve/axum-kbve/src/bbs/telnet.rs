use std::collections::VecDeque;
use std::io;
use std::time::{Duration, Instant};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

pub const IAC: u8 = 255;
pub const DONT: u8 = 254;
pub const DO: u8 = 253;
pub const WONT: u8 = 252;
pub const WILL: u8 = 251;
pub const SB: u8 = 250;
pub const SE: u8 = 240;

pub const OPT_BINARY: u8 = 0;
pub const OPT_ECHO: u8 = 1;
pub const OPT_SGA: u8 = 3;
pub const OPT_TTYPE: u8 = 24;
pub const OPT_NAWS: u8 = 31;

const TTYPE_IS: u8 = 0;
const TTYPE_SEND: u8 = 1;

const LF: u8 = 0x0A;

const READ_CHUNK: usize = 512;
const MAX_SUBNEG: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum State {
    Data,
    Iac,
    Will,
    Wont,
    Do,
    Dont,
    Sb,
    SbIac,
}

#[derive(Debug)]
pub enum ReadError {
    Closed,
    Timeout,
    Io(#[allow(dead_code)] io::Error),
}

impl From<io::Error> for ReadError {
    fn from(e: io::Error) -> Self {
        ReadError::Io(e)
    }
}

/// Telnet-aware framing over a raw TCP socket, with NAWS and TTYPE captured out of band.
pub struct TelnetConn {
    stream: TcpStream,
    state: State,
    subneg: Vec<u8>,
    pending: VecDeque<u8>,
    will_sent: [bool; 256],
    do_sent: [bool; 256],
    pub width: u16,
    pub height: u16,
    pub term_type: Option<String>,
    idle_timeout: Duration,
}

impl TelnetConn {
    pub fn new(stream: TcpStream, idle_timeout: Duration) -> Self {
        Self {
            stream,
            state: State::Data,
            subneg: Vec::new(),
            pending: VecDeque::new(),
            will_sent: [false; 256],
            do_sent: [false; 256],
            width: 40,
            height: 25,
            term_type: None,
            idle_timeout,
        }
    }

    /// Offer server-side echo plus suppress-go-ahead and ask for window size and terminal type.
    pub async fn negotiate(&mut self) -> io::Result<()> {
        for opt in [OPT_ECHO, OPT_SGA] {
            self.send_will(opt).await?;
        }
        for opt in [OPT_NAWS, OPT_TTYPE, OPT_SGA] {
            self.send_do(opt).await?;
        }
        Ok(())
    }

    async fn send_cmd(&mut self, verb: u8, opt: u8) -> io::Result<()> {
        self.stream.write_all(&[IAC, verb, opt]).await
    }

    async fn send_will(&mut self, opt: u8) -> io::Result<()> {
        if !self.will_sent[opt as usize] {
            self.will_sent[opt as usize] = true;
            self.send_cmd(WILL, opt).await?;
        }
        Ok(())
    }

    async fn send_do(&mut self, opt: u8) -> io::Result<()> {
        if !self.do_sent[opt as usize] {
            self.do_sent[opt as usize] = true;
            self.send_cmd(DO, opt).await?;
        }
        Ok(())
    }

    /// Write bytes verbatim, doubling `0xFF` so PETSCII pi never reads as an IAC.
    pub async fn write(&mut self, bytes: &[u8]) -> io::Result<()> {
        let mut escaped = Vec::with_capacity(bytes.len());
        for &b in bytes {
            escaped.push(b);
            if b == IAC {
                escaped.push(IAC);
            }
        }
        self.stream.write_all(&escaped).await?;
        self.stream.flush().await
    }

    /// Absorb the client's negotiation replies for a short window, discarding any early keystrokes.
    pub async fn drain_negotiation(&mut self, window: Duration) {
        let deadline = Instant::now() + window;
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                break;
            }
            let mut buf = [0u8; READ_CHUNK];
            match tokio::time::timeout(remaining, self.stream.read(&mut buf)).await {
                Ok(Ok(0)) | Err(_) => break,
                Ok(Ok(n)) => {
                    if self.consume(&buf[..n]).await.is_err() {
                        break;
                    }
                }
                Ok(Err(_)) => break,
            }
        }
        self.pending.clear();
    }

    pub async fn read_byte(&mut self) -> Result<u8, ReadError> {
        loop {
            if let Some(b) = self.pending.pop_front() {
                return Ok(b);
            }
            let mut buf = [0u8; READ_CHUNK];
            let n = match tokio::time::timeout(self.idle_timeout, self.stream.read(&mut buf)).await
            {
                Err(_) => return Err(ReadError::Timeout),
                Ok(Ok(0)) => return Err(ReadError::Closed),
                Ok(Ok(n)) => n,
                Ok(Err(e)) => return Err(ReadError::Io(e)),
            };
            self.consume(&buf[..n]).await?;
        }
    }

    async fn consume(&mut self, chunk: &[u8]) -> Result<(), ReadError> {
        for &b in chunk {
            match self.state {
                State::Data => match b {
                    IAC => self.state = State::Iac,
                    _ => self.pending.push_back(b),
                },
                State::Iac => match b {
                    IAC => {
                        self.pending.push_back(IAC);
                        self.state = State::Data;
                    }
                    WILL => self.state = State::Will,
                    WONT => self.state = State::Wont,
                    DO => self.state = State::Do,
                    DONT => self.state = State::Dont,
                    SB => {
                        self.subneg.clear();
                        self.state = State::Sb;
                    }
                    _ => self.state = State::Data,
                },
                State::Will => {
                    self.on_will(b).await?;
                    self.state = State::Data;
                }
                State::Wont => {
                    self.do_sent[b as usize] = false;
                    self.state = State::Data;
                }
                State::Do => {
                    self.on_do(b).await?;
                    self.state = State::Data;
                }
                State::Dont => {
                    self.will_sent[b as usize] = false;
                    self.state = State::Data;
                }
                State::Sb => {
                    if b == IAC {
                        self.state = State::SbIac;
                    } else if self.subneg.len() < MAX_SUBNEG {
                        self.subneg.push(b);
                    }
                }
                State::SbIac => {
                    if b == SE {
                        let payload = std::mem::take(&mut self.subneg);
                        self.on_subneg(&payload).await?;
                        self.state = State::Data;
                    } else {
                        if b == IAC && self.subneg.len() < MAX_SUBNEG {
                            self.subneg.push(IAC);
                        }
                        self.state = State::Sb;
                    }
                }
            }
        }
        Ok(())
    }

    async fn on_will(&mut self, opt: u8) -> Result<(), ReadError> {
        match opt {
            OPT_NAWS | OPT_SGA | OPT_BINARY => self.send_do(opt).await?,
            OPT_TTYPE => {
                self.send_do(opt).await?;
                self.stream
                    .write_all(&[IAC, SB, OPT_TTYPE, TTYPE_SEND, IAC, SE])
                    .await?;
            }
            _ => self.send_cmd(DONT, opt).await?,
        }
        Ok(())
    }

    async fn on_do(&mut self, opt: u8) -> Result<(), ReadError> {
        match opt {
            OPT_ECHO | OPT_SGA | OPT_BINARY => self.send_will(opt).await?,
            _ => self.send_cmd(WONT, opt).await?,
        }
        Ok(())
    }

    async fn on_subneg(&mut self, payload: &[u8]) -> Result<(), ReadError> {
        match payload.first().copied() {
            Some(OPT_NAWS) if payload.len() >= 5 => {
                let w = u16::from_be_bytes([payload[1], payload[2]]);
                let h = u16::from_be_bytes([payload[3], payload[4]]);
                if w > 0 {
                    self.width = w;
                }
                if h > 0 {
                    self.height = h;
                }
            }
            Some(OPT_TTYPE) if payload.len() >= 2 && payload[1] == TTYPE_IS => {
                let name: String = payload[2..]
                    .iter()
                    .filter(|b| b.is_ascii_graphic() || **b == b' ')
                    .map(|b| *b as char)
                    .collect();
                if !name.is_empty() {
                    self.term_type = Some(name.trim().to_ascii_uppercase());
                }
            }
            _ => {}
        }
        Ok(())
    }

    /// Read one keypress, folding CR/LF pairs into a single `\r`.
    pub async fn read_key(&mut self) -> Result<u8, ReadError> {
        loop {
            let b = self.read_byte().await?;
            match b {
                LF => continue,
                0 => continue,
                _ => return Ok(b),
            }
        }
    }

    pub async fn shutdown(&mut self) {
        let _ = self.stream.shutdown().await;
    }
}
