use super::text::Rng;
use super::{Flow, Game};
use crate::bbs::render::{Ink, Screen};

const DAYS: u32 = 30;
const START_CASH: i64 = 2_000;
const START_DEBT: i64 = 5_500;
const START_COAT: u32 = 100;
const INTEREST_PCT: i64 = 10;
const LOAN_CITY: usize = 0;

struct Good {
    name: &'static str,
    low: i64,
    high: i64,
}

const GOODS: &[Good] = &[
    Good {
        name: "Ludes",
        low: 11,
        high: 60,
    },
    Good {
        name: "Speed",
        low: 70,
        high: 250,
    },
    Good {
        name: "Weed",
        low: 315,
        high: 890,
    },
    Good {
        name: "Acid",
        low: 1_000,
        high: 4_400,
    },
    Good {
        name: "Heroin",
        low: 5_500,
        high: 13_000,
    },
    Good {
        name: "Cocaine",
        low: 15_000,
        high: 29_000,
    },
];

const CITIES: &[&str] = &[
    "The Bronx",
    "Ghetto",
    "Central Park",
    "Manhattan",
    "Coney Island",
    "Brooklyn",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum View {
    Market,
    Buy,
    Sell,
    Travel,
    Over,
}

/// Cash and debt in whole dollars with thousands separators, which is most of
/// what this door draws and all of what a caller reads twice.
fn money(amount: i64) -> String {
    let sign = if amount < 0 { "-" } else { "" };
    let digits = amount.abs().to_string();
    let mut grouped = String::with_capacity(digits.len() + digits.len() / 3);
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            grouped.push(',');
        }
        grouped.push(c);
    }
    format!("{sign}${grouped}")
}

pub struct DopeWars {
    rng: Rng,
    day: u32,
    here: usize,
    cash: i64,
    debt: i64,
    coat: u32,
    stash: Vec<u32>,
    price: Vec<i64>,
    view: View,
    picked: Option<usize>,
    notice: Option<String>,
}

impl DopeWars {
    pub fn new(mut rng: Rng) -> Self {
        let mut game = Self {
            price: vec![0; GOODS.len()],
            stash: vec![0; GOODS.len()],
            day: 1,
            here: LOAN_CITY,
            cash: START_CASH,
            debt: START_DEBT,
            coat: START_COAT,
            view: View::Market,
            picked: None,
            notice: None,
            rng: Rng::new(rng.next_u64()),
        };
        game.roll_market();
        game
    }

    /// Not every good is on the street every day, which is what makes a
    /// particular borough worth the trip rather than one stop being strictly
    /// better than the others.
    fn roll_market(&mut self) {
        for (i, good) in GOODS.iter().enumerate() {
            self.price[i] = if self.rng.below(4) == 0 {
                0
            } else {
                let spread = (good.high - good.low).max(1) as usize;
                good.low + self.rng.below(spread) as i64
            };
        }
        if self.price.iter().all(|p| *p == 0) {
            let good = &GOODS[0];
            self.price[0] = good.low;
        }
    }

    fn carried(&self) -> u32 {
        self.stash.iter().sum()
    }

    fn space(&self) -> u32 {
        self.coat.saturating_sub(self.carried())
    }

    fn net_worth(&self) -> i64 {
        self.cash - self.debt
    }

    /// Arrival rolls one street event. Each either moves a price hard enough
    /// to be worth acting on or changes what the caller is carrying, so a day
    /// never passes with nothing to react to but the prices themselves.
    fn street_event(&mut self) {
        let stocked: Vec<usize> = (0..GOODS.len()).filter(|i| self.price[*i] > 0).collect();
        match self.rng.below(10) {
            0 if !stocked.is_empty() => {
                let pick = stocked[self.rng.below(stocked.len())];
                self.price[pick] *= 4;
                self.notice = Some(format!(
                    "word is {} is scarce - prices way up",
                    GOODS[pick].name
                ));
            }
            1 if !stocked.is_empty() => {
                let pick = stocked[self.rng.below(stocked.len())];
                self.price[pick] = (self.price[pick] / 4).max(1);
                self.notice = Some(format!(
                    "the market is flooded with cheap {}",
                    GOODS[pick].name
                ));
            }
            2 if self.carried() > 0 => {
                let held: Vec<usize> = (0..GOODS.len()).filter(|i| self.stash[*i] > 0).collect();
                let pick = held[self.rng.below(held.len())];
                let lost = (self.stash[pick] / 2).max(1);
                self.stash[pick] -= lost;
                self.notice = Some(format!(
                    "officer hardass! you ditch {lost} {}",
                    GOODS[pick].name
                ));
            }
            3 if self.cash > 200 => {
                let lost = self.cash / (4 + self.rng.below(4) as i64);
                self.cash -= lost;
                self.notice = Some(format!("mugged in an alley - lost {}", money(lost)));
            }
            4 if self.space() > 5 => {
                let pick = self.rng.below(GOODS.len());
                let found = 1 + self.rng.below(self.space().min(8) as usize) as u32;
                self.stash[pick] += found;
                self.notice = Some(format!(
                    "you find {found} {} on the ground",
                    GOODS[pick].name
                ));
            }
            5 => {
                self.coat += 10;
                self.notice = Some("a tailor sews you a deeper coat (+10)".to_string());
            }
            _ => self.notice = None,
        }
    }

    fn travel(&mut self, to: usize) {
        if to == self.here {
            self.notice = Some("you are already there".to_string());
            self.view = View::Market;
            return;
        }
        self.here = to;
        self.day += 1;
        self.debt += self.debt * INTEREST_PCT / 100;
        self.roll_market();
        self.street_event();
        self.view = if self.day > DAYS {
            View::Over
        } else {
            View::Market
        };
    }

    fn repay(&mut self) {
        if self.here != LOAN_CITY {
            self.notice = Some(format!("the shark only collects in {}", CITIES[LOAN_CITY]));
            return;
        }
        if self.debt == 0 {
            self.notice = Some("you owe nothing".to_string());
            return;
        }
        let paid = self.cash.min(self.debt);
        if paid <= 0 {
            self.notice = Some("no cash to pay with".to_string());
            return;
        }
        self.cash -= paid;
        self.debt -= paid;
        self.notice = Some(format!("paid the shark {}", money(paid)));
    }

    /// The most a caller could take of the picked good, so `max` means the
    /// same thing on both sides of a trade without them working it out.
    fn most(&self, good: usize) -> u32 {
        match self.view {
            View::Buy => {
                let price = self.price[good];
                if price <= 0 {
                    return 0;
                }
                let affordable = (self.cash / price).clamp(0, u32::MAX as i64) as u32;
                affordable.min(self.space())
            }
            _ => self.stash[good],
        }
    }

    fn trade(&mut self, good: usize, qty: u32) {
        let most = self.most(good);
        if qty == 0 {
            self.notice = None;
            return;
        }
        if qty > most {
            self.notice = Some(format!("you can only manage {most}"));
            return;
        }
        let value = self.price[good] * qty as i64;
        match self.view {
            View::Buy => {
                self.cash -= value;
                self.stash[good] += qty;
                self.notice = Some(format!(
                    "bought {qty} {} for {}",
                    GOODS[good].name,
                    money(value)
                ));
            }
            _ => {
                self.cash += value;
                self.stash[good] -= qty;
                self.notice = Some(format!(
                    "sold {qty} {} for {}",
                    GOODS[good].name,
                    money(value)
                ));
            }
        }
        self.view = View::Market;
    }

    fn draw_status(&self, screen: &mut Screen) {
        screen
            .ink(Ink::Body)
            .line(&format!(
                "Day {}/{}  {}",
                self.day.min(DAYS),
                DAYS,
                CITIES[self.here]
            ))
            .line(&format!(
                "Cash {}  Debt {}",
                money(self.cash),
                money(self.debt)
            ))
            .line(&format!("Coat {}/{}", self.carried(), self.coat))
            .reset();
    }

    fn draw_notice(&self, screen: &mut Screen) {
        if let Some(notice) = &self.notice {
            screen.ink(Ink::Warn).line(notice).reset();
        }
    }

    fn row(&self, good: usize) -> String {
        format!(
            "{:<8}{:>9}  x{}",
            GOODS[good].name,
            money(self.price[good]),
            self.stash[good]
        )
    }

    /// The board is a price list, not a menu: it draws no keys, because a key
    /// on screen that does nothing when pressed is worse than no key at all.
    fn draw_board(&self, screen: &mut Screen) {
        let mut shown = 0;
        for good in 0..GOODS.len() {
            if self.price[good] <= 0 {
                continue;
            }
            shown += 1;
            screen
                .ink(Ink::Body)
                .line(&format!("  {}", self.row(good)))
                .reset();
        }
        if shown == 0 {
            screen
                .ink(Ink::Dim)
                .line("  the street is empty today")
                .reset();
        }
    }

    /// Only goods the caller can actually move are drawn with a key, so a
    /// number on screen is always a number the door will accept. An expensive
    /// good with no cash behind it is on the board but not in this list.
    fn draw_trade(&self, screen: &mut Screen) {
        let mut offered = 0;
        for good in 0..GOODS.len() {
            if self.price[good] <= 0 || self.most(good) == 0 {
                continue;
            }
            offered += 1;
            let key = char::from_digit(good as u32 + 1, 10).unwrap_or('?');
            screen.item(key, &self.row(good));
        }
        if offered == 0 {
            let empty = match self.view {
                View::Buy => "  nothing here you can afford",
                _ => "  nothing in the coat worth selling",
            };
            screen.ink(Ink::Dim).line(empty).reset();
        }
    }
}

#[cfg(test)]
impl DopeWars {
    pub fn cash(&self) -> i64 {
        self.cash
    }

    pub fn debt(&self) -> i64 {
        self.debt
    }

    pub fn coat(&self) -> u32 {
        self.coat
    }

    pub fn held(&self) -> u32 {
        self.carried()
    }

    pub fn finished(&self) -> bool {
        self.view == View::Over
    }
}

impl Game for DopeWars {
    fn title(&self) -> &str {
        "Dope Wars"
    }

    fn draw(&self, screen: &mut Screen) {
        if self.view == View::Over {
            screen.nl();
            screen
                .ink(Ink::Body)
                .line(&format!("{DAYS} days done in {}", CITIES[self.here]))
                .line(&format!("Cash {}", money(self.cash)))
                .line(&format!("Debt {}", money(self.debt)))
                .reset()
                .nl();
            screen
                .ink(Ink::Accent)
                .line(&format!("Final take {}", money(self.net_worth())))
                .reset()
                .nl();
            screen.item('Q', "Back");
            screen.prompt("command> ");
            return;
        }

        self.draw_status(screen);
        screen.nl();

        match self.view {
            View::Buy | View::Sell => {
                let picked = self.picked.map(|i| GOODS[i].name);
                match picked {
                    Some(name) => {
                        screen
                            .ink(Ink::Prompt)
                            .line(&format!(
                                "{} {name} - up to {}",
                                if self.view == View::Buy {
                                    "Buying"
                                } else {
                                    "Selling"
                                },
                                self.most(self.picked.unwrap_or(0))
                            ))
                            .reset();
                        screen
                            .ink(Ink::Dim)
                            .line("  a number, MAX, or [esc] to drop it")
                            .reset();
                    }
                    None => {
                        self.draw_trade(screen);
                        screen.item('Q', "Back");
                    }
                }
            }
            View::Travel => {
                for (i, city) in CITIES.iter().enumerate() {
                    if i == self.here {
                        continue;
                    }
                    let key = char::from_digit(i as u32 + 1, 10).unwrap_or('?');
                    screen.item(key, city);
                }
                screen.item('Q', "Back");
            }
            _ => {
                self.draw_board(screen);
                screen.nl();
                self.draw_notice(screen);
                screen.item('B', "Buy");
                screen.item('S', "Sell");
                screen.item('T', "Travel");
                if self.here == LOAN_CITY && self.debt > 0 {
                    screen.item('P', "Pay the shark");
                }
                screen.item('Q', "Back");
            }
        }

        if self.picked.is_none() {
            screen.prompt("command> ");
        }
    }

    fn prompt(&self) -> Option<&str> {
        self.picked.map(|_| match self.view {
            View::Buy => "buy how many> ",
            _ => "sell how many> ",
        })
    }

    fn on_line(&mut self, line: &str) -> Flow {
        let Some(good) = self.picked.take() else {
            return Flow::Continue;
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            self.view = View::Market;
            return Flow::Continue;
        }
        let qty = if trimmed.eq_ignore_ascii_case("max") || trimmed.eq_ignore_ascii_case("all") {
            self.most(good)
        } else {
            match trimmed.parse::<u32>() {
                Ok(n) => n,
                Err(_) => {
                    self.notice = Some("a number, or MAX".to_string());
                    self.view = View::Market;
                    return Flow::Continue;
                }
            }
        };
        self.trade(good, qty);
        Flow::Continue
    }

    fn on_key(&mut self, key: char) -> Flow {
        if self.view == View::Over {
            return Flow::Exit;
        }
        match self.view {
            View::Buy | View::Sell => match key {
                'Q' => {
                    self.view = View::Market;
                    self.notice = None;
                }
                _ => {
                    let Some(good) = key.to_digit(10).and_then(|d| d.checked_sub(1)) else {
                        return Flow::Continue;
                    };
                    let good = good as usize;
                    if good >= GOODS.len() || self.price[good] <= 0 || self.most(good) == 0 {
                        return Flow::Continue;
                    }
                    self.picked = Some(good);
                }
            },
            View::Travel => match key {
                'Q' => self.view = View::Market,
                _ => {
                    let Some(city) = key.to_digit(10).and_then(|d| d.checked_sub(1)) else {
                        return Flow::Continue;
                    };
                    let city = city as usize;
                    if city < CITIES.len() {
                        self.travel(city);
                    }
                }
            },
            _ => match key {
                'Q' => return Flow::Exit,
                'B' => {
                    self.view = View::Buy;
                    self.notice = None;
                }
                'S' => {
                    self.view = View::Sell;
                    self.notice = None;
                }
                'T' => {
                    self.view = View::Travel;
                    self.notice = None;
                }
                'P' => self.repay(),
                _ => {}
            },
        }
        Flow::Continue
    }
}
