use embassy_net::tcp::{Error, TcpSocket};

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
const TERM_NAME: &[u8] = b"ansi";
const MAX_SUBNEG: usize = 32;

#[derive(Clone, Copy, PartialEq, Eq)]
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

pub struct Telnet {
    state: State,
    subneg: [u8; MAX_SUBNEG],
    subneg_len: usize,
    cols: u16,
    rows: u16,
}

impl Telnet {
    pub fn new(cols: u16, rows: u16) -> Self {
        Self {
            state: State::Data,
            subneg: [0; MAX_SUBNEG],
            subneg_len: 0,
            cols,
            rows,
        }
    }

    pub async fn greet(&mut self, socket: &mut TcpSocket<'_>) -> Result<(), Error> {
        socket
            .write(&[
                IAC, WILL, OPT_TTYPE, IAC, WILL, OPT_NAWS, IAC, DO, OPT_SGA, IAC, DO, OPT_ECHO,
            ])
            .await?;
        self.send_naws(socket).await
    }

    pub async fn feed(
        &mut self,
        input: &[u8],
        out: &mut [u8],
        socket: &mut TcpSocket<'_>,
    ) -> Result<usize, Error> {
        let mut written = 0;

        for &byte in input {
            match self.state {
                State::Data => {
                    if byte == IAC {
                        self.state = State::Iac;
                    } else if written < out.len() {
                        out[written] = byte;
                        written += 1;
                    }
                }
                State::Iac => match byte {
                    IAC => {
                        if written < out.len() {
                            out[written] = IAC;
                            written += 1;
                        }
                        self.state = State::Data;
                    }
                    WILL => self.state = State::Will,
                    WONT => self.state = State::Wont,
                    DO => self.state = State::Do,
                    DONT => self.state = State::Dont,
                    SB => {
                        self.subneg_len = 0;
                        self.state = State::Sb;
                    }
                    _ => self.state = State::Data,
                },
                State::Will => {
                    let accept = matches!(byte, OPT_ECHO | OPT_SGA | OPT_BINARY);
                    let verb = if accept { DO } else { DONT };
                    socket.write(&[IAC, verb, byte]).await?;
                    self.state = State::Data;
                }
                State::Wont => {
                    socket.write(&[IAC, DONT, byte]).await?;
                    self.state = State::Data;
                }
                State::Do => {
                    let accept = matches!(byte, OPT_TTYPE | OPT_NAWS | OPT_SGA | OPT_BINARY);
                    let verb = if accept { WILL } else { WONT };
                    socket.write(&[IAC, verb, byte]).await?;
                    if byte == OPT_NAWS {
                        self.send_naws(socket).await?;
                    }
                    self.state = State::Data;
                }
                State::Dont => {
                    socket.write(&[IAC, WONT, byte]).await?;
                    self.state = State::Data;
                }
                State::Sb => {
                    if byte == IAC {
                        self.state = State::SbIac;
                    } else if self.subneg_len < MAX_SUBNEG {
                        self.subneg[self.subneg_len] = byte;
                        self.subneg_len += 1;
                    }
                }
                State::SbIac => {
                    if byte == IAC {
                        if self.subneg_len < MAX_SUBNEG {
                            self.subneg[self.subneg_len] = IAC;
                            self.subneg_len += 1;
                        }
                        self.state = State::Sb;
                    } else {
                        if byte == SE {
                            self.finish_subneg(socket).await?;
                        }
                        self.state = State::Data;
                    }
                }
            }
        }

        Ok(written)
    }

    async fn finish_subneg(&mut self, socket: &mut TcpSocket<'_>) -> Result<(), Error> {
        if self.subneg_len >= 2 && self.subneg[0] == OPT_TTYPE && self.subneg[1] == TTYPE_SEND {
            let mut reply = [0u8; 6 + TERM_NAME.len()];
            reply[0] = IAC;
            reply[1] = SB;
            reply[2] = OPT_TTYPE;
            reply[3] = TTYPE_IS;
            reply[4..4 + TERM_NAME.len()].copy_from_slice(TERM_NAME);
            reply[4 + TERM_NAME.len()] = IAC;
            reply[5 + TERM_NAME.len()] = SE;
            socket.write(&reply).await?;
        }
        self.subneg_len = 0;
        Ok(())
    }

    async fn send_naws(&mut self, socket: &mut TcpSocket<'_>) -> Result<(), Error> {
        let cols = self.cols.to_be_bytes();
        let rows = self.rows.to_be_bytes();
        socket
            .write(&[
                IAC, SB, OPT_NAWS, cols[0], cols[1], rows[0], rows[1], IAC, SE,
            ])
            .await?;
        Ok(())
    }
}
