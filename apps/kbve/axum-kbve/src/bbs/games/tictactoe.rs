use super::text::Rng;
use super::{Flow, Game};
use crate::bbs::render::{Ink, Screen};

const LINES: [[usize; 3]; 8] = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cell {
    Empty,
    You,
    Cpu,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Playing,
    YouWin,
    CpuWin,
    Draw,
}

pub struct TicTacToe {
    rng: Rng,
    board: [Cell; 9],
    outcome: Outcome,
    wins: u32,
    losses: u32,
    draws: u32,
}

fn winner(board: &[Cell; 9]) -> Option<Cell> {
    LINES.iter().find_map(|line| {
        let [a, b, c] = *line;
        if board[a] != Cell::Empty && board[a] == board[b] && board[b] == board[c] {
            Some(board[a])
        } else {
            None
        }
    })
}

fn open(board: &[Cell; 9]) -> Vec<usize> {
    (0..9).filter(|&i| board[i] == Cell::Empty).collect()
}

/// Win if we can, else block, else take centre, else a corner, else anything.
fn cpu_move(board: &[Cell; 9], rng: &mut Rng) -> Option<usize> {
    let free = open(board);
    if free.is_empty() {
        return None;
    }

    for (mark, _) in [(Cell::Cpu, 0), (Cell::You, 1)] {
        for &i in &free {
            let mut probe = *board;
            probe[i] = mark;
            if winner(&probe) == Some(mark) {
                return Some(i);
            }
        }
    }

    if board[4] == Cell::Empty {
        return Some(4);
    }

    let corners: Vec<usize> = [0, 2, 6, 8]
        .into_iter()
        .filter(|&i| board[i] == Cell::Empty)
        .collect();
    if !corners.is_empty() {
        return Some(corners[rng.below(corners.len())]);
    }

    Some(free[rng.below(free.len())])
}

impl TicTacToe {
    pub fn new(rng: Rng) -> Self {
        Self {
            rng,
            board: [Cell::Empty; 9],
            outcome: Outcome::Playing,
            wins: 0,
            losses: 0,
            draws: 0,
        }
    }

    #[cfg(test)]
    pub fn outcome(&self) -> Outcome {
        self.outcome
    }

    #[cfg(test)]
    pub fn board(&self) -> &[Cell; 9] {
        &self.board
    }

    fn reset(&mut self) {
        self.board = [Cell::Empty; 9];
        self.outcome = Outcome::Playing;
    }

    fn settle(&mut self) {
        self.outcome = match winner(&self.board) {
            Some(Cell::You) => {
                self.wins += 1;
                Outcome::YouWin
            }
            Some(Cell::Cpu) => {
                self.losses += 1;
                Outcome::CpuWin
            }
            _ if open(&self.board).is_empty() => {
                self.draws += 1;
                Outcome::Draw
            }
            _ => Outcome::Playing,
        };
    }

    fn play(&mut self, spot: usize) {
        if self.outcome != Outcome::Playing || self.board[spot] != Cell::Empty {
            return;
        }
        self.board[spot] = Cell::You;
        self.settle();
        if self.outcome != Outcome::Playing {
            return;
        }
        if let Some(reply) = cpu_move(&self.board, &mut self.rng) {
            self.board[reply] = Cell::Cpu;
        }
        self.settle();
    }
}

fn glyph(cell: Cell, index: usize) -> String {
    match cell {
        Cell::You => "X".to_string(),
        Cell::Cpu => "O".to_string(),
        Cell::Empty => (index + 1).to_string(),
    }
}

impl Game for TicTacToe {
    fn title(&self) -> &str {
        "TIC-TAC-TOE"
    }

    fn draw(&self, screen: &mut Screen) {
        screen.nl().ink(Ink::Body);
        for row in 0..3 {
            let cells: Vec<String> = (0..3)
                .map(|col| {
                    let i = row * 3 + col;
                    glyph(self.board[i], i)
                })
                .collect();
            screen.line(&format!("     {} | {} | {}", cells[0], cells[1], cells[2]));
            if row < 2 {
                screen.line("    ---+---+---");
            }
        }

        screen.nl().ink(Ink::Dim);
        screen.line(&format!(
            "won {}  lost {}  drew {}",
            self.wins, self.losses, self.draws
        ));
        screen.reset();

        match self.outcome {
            Outcome::Playing => {
                screen.nl().ink(Ink::Body).line("you are X").reset();
                screen.prompt("pick 1-9> ");
            }
            other => {
                let note = match other {
                    Outcome::YouWin => "you win",
                    Outcome::CpuWin => "cpu wins",
                    _ => "draw",
                };
                screen.nl().ink(Ink::Accent).line(note).reset().nl();
                screen.item('N', "New game");
                screen.item('Q', "Back");
                screen.prompt("command> ");
            }
        }
    }

    fn on_key(&mut self, key: char) -> Flow {
        match key {
            'Q' => return Flow::Exit,
            'N' if self.outcome != Outcome::Playing => self.reset(),
            k => {
                if let Some(spot) = k.to_digit(10).and_then(|d| d.checked_sub(1)) {
                    if spot < 9 {
                        self.play(spot as usize);
                    }
                }
            }
        }
        Flow::Continue
    }
}
