use super::text::Rng;
use super::{Flow, Game};
use crate::bbs::render::{Ink, Screen};

const MAX_MISSES: usize = 6;

/// Must not contain `Q`: that key is reserved for leaving the game, so a
/// word needing it would be unsolvable. Enforced by `hangman_words_are_guessable`.
pub(in crate::bbs) const WORDS: &[(&str, &str)] = &[
    ("TELNET", "how you got here"),
    ("PETSCII", "commodore character set"),
    ("MODEM", "screams before it connects"),
    ("SYSOP", "runs the board"),
    ("DUNGEON", "where the slimes live"),
    ("CARRIER", "lost at hangup"),
    ("TERMINAL", "glass teletype"),
    ("BAUD", "symbols per second"),
    ("PACKET", "routed and switched"),
    ("KERNEL", "ring zero"),
    ("CIPHER", "keeps a secret"),
    ("DAEMON", "runs in the background"),
];

const GALLOWS: [&str; MAX_MISSES + 1] = [
    "  +---+\n      |\n      |\n      |\n     ===",
    "  +---+\n  O   |\n      |\n      |\n     ===",
    "  +---+\n  O   |\n  |   |\n      |\n     ===",
    "  +---+\n  O   |\n /|   |\n      |\n     ===",
    "  +---+\n  O   |\n /|\\  |\n      |\n     ===",
    "  +---+\n  O   |\n /|\\  |\n /    |\n     ===",
    "  +---+\n  O   |\n /|\\  |\n / \\  |\n     ===",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum State {
    Playing,
    Won,
    Lost,
}

pub struct Hangman {
    rng: Rng,
    word: &'static str,
    hint: &'static str,
    guessed: Vec<char>,
    misses: usize,
    state: State,
    wins: u32,
    losses: u32,
}

impl Hangman {
    pub fn new(mut rng: Rng) -> Self {
        let (word, hint) = WORDS[rng.below(WORDS.len())];
        Self {
            rng,
            word,
            hint,
            guessed: Vec::new(),
            misses: 0,
            state: State::Playing,
            wins: 0,
            losses: 0,
        }
    }

    pub fn state(&self) -> State {
        self.state
    }

    pub fn answer(&self) -> &'static str {
        self.word
    }

    pub fn masked(&self) -> String {
        self.word
            .chars()
            .map(|c| if self.guessed.contains(&c) { c } else { '_' })
            .collect::<Vec<char>>()
            .iter()
            .map(|c| c.to_string())
            .collect::<Vec<String>>()
            .join(" ")
    }

    fn next_word(&mut self) {
        let (word, hint) = WORDS[self.rng.below(WORDS.len())];
        self.word = word;
        self.hint = hint;
        self.guessed.clear();
        self.misses = 0;
        self.state = State::Playing;
    }

    fn guess(&mut self, letter: char) {
        if self.state != State::Playing || self.guessed.contains(&letter) {
            return;
        }
        self.guessed.push(letter);

        if !self.word.contains(letter) {
            self.misses += 1;
            if self.misses >= MAX_MISSES {
                self.state = State::Lost;
                self.losses += 1;
            }
            return;
        }

        if self.word.chars().all(|c| self.guessed.contains(&c)) {
            self.state = State::Won;
            self.wins += 1;
        }
    }
}

impl Game for Hangman {
    fn title(&self) -> &str {
        "HANGMAN"
    }

    fn draw(&self, screen: &mut Screen) {
        screen.nl().ink(Ink::Body);
        for line in GALLOWS[self.misses.min(MAX_MISSES)].split('\n') {
            screen.line(line);
        }

        screen.nl().ink(Ink::Accent).line(&self.masked());
        screen.ink(Ink::Dim).line(&format!("hint: {}", self.hint));

        let wrong: String = self
            .guessed
            .iter()
            .filter(|c| !self.word.contains(**c))
            .map(|c| c.to_string())
            .collect::<Vec<String>>()
            .join(" ");
        if !wrong.is_empty() {
            screen.line(&format!("missed: {wrong}"));
        }
        screen.line(&format!(
            "won {}  lost {}  misses {}/{}",
            self.wins, self.losses, self.misses, MAX_MISSES
        ));
        screen.reset();

        match self.state {
            State::Playing => {
                screen.prompt("letter> ");
            }
            State::Won => {
                screen.nl().ink(Ink::Accent).line("solved").reset().nl();
                screen.item('N', "Next word");
                screen.item('Q', "Back");
                screen.prompt("command> ");
            }
            State::Lost => {
                screen
                    .nl()
                    .ink(Ink::Warn)
                    .line(&format!("the word was {}", self.word))
                    .reset()
                    .nl();
                screen.item('N', "Next word");
                screen.item('Q', "Back");
                screen.prompt("command> ");
            }
        }
    }

    fn on_key(&mut self, key: char) -> Flow {
        match key {
            'Q' => return Flow::Exit,
            'N' if self.state != State::Playing => self.next_word(),
            c if c.is_ascii_uppercase() && self.state == State::Playing => self.guess(c),
            _ => {}
        }
        Flow::Continue
    }
}
