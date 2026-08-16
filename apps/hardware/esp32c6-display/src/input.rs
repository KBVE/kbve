use esp_hal::gpio::Input;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Press {
    Short,
    Long,
}

pub struct Button<'d> {
    pin: Input<'d>,
    down: bool,
    candidate: bool,
    agreements: u8,
    settle: u32,
    held: u32,
    long_sent: bool,
    debounce: u8,
    long_ticks: u32,
}

impl<'d> Button<'d> {
    pub fn new(pin: Input<'d>, debounce: u8, long_ticks: u32, settle: u32) -> Self {
        Self {
            pin,
            down: false,
            candidate: false,
            agreements: 0,
            settle,
            held: 0,
            long_sent: false,
            debounce,
            long_ticks,
        }
    }

    pub fn poll(&mut self) -> Option<Press> {
        let level = self.pin.is_low();

        if self.settle > 0 {
            self.settle -= 1;
            self.down = level;
            self.candidate = level;
            return None;
        }

        if self.down {
            self.held += 1;
            if !self.long_sent && self.held >= self.long_ticks {
                self.long_sent = true;
                return Some(Press::Long);
            }
        }

        if level != self.candidate {
            self.candidate = level;
            self.agreements = 0;
            return None;
        }

        if level == self.down {
            return None;
        }

        self.agreements += 1;
        if self.agreements < self.debounce {
            return None;
        }

        self.agreements = 0;
        self.down = level;

        if level {
            self.held = 0;
            self.long_sent = false;
            return None;
        }

        if self.long_sent {
            None
        } else {
            Some(Press::Short)
        }
    }

    pub fn is_down(&self) -> bool {
        self.down
    }
}
