use crate::bbs::render::{Ink, Screen, Term};

/// What a single map cell shows. Front ends decide the glyph; the caller
/// decides which cells exist.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cell {
    Unknown,
    Visited,
    Cleared,
    Current,
    Boss,
    Shop,
    Shrine,
    Exit,
}

/// Which way a corridor leaves a cell.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Links {
    pub north: bool,
    pub south: bool,
    pub east: bool,
    pub west: bool,
}

impl Links {
    pub const NONE: Links = Links {
        north: false,
        south: false,
        east: false,
        west: false,
    };
}

/// A rectangular slice of the dungeon ready to draw.
pub struct Grid {
    pub width: usize,
    pub height: usize,
    pub cells: Vec<(Cell, Links)>,
}

impl Grid {
    pub fn new(width: usize, height: usize) -> Self {
        Self {
            width,
            height,
            cells: vec![(Cell::Unknown, Links::NONE); width * height],
        }
    }

    pub fn set(&mut self, x: usize, y: usize, cell: Cell, links: Links) {
        if x < self.width && y < self.height {
            let i = y * self.width + x;
            self.cells[i] = (cell, links);
        }
    }

    fn at(&self, x: usize, y: usize) -> (Cell, Links) {
        self.cells
            .get(y * self.width + x)
            .copied()
            .unwrap_or((Cell::Unknown, Links::NONE))
    }
}

fn ascii_glyph(cell: Cell) -> char {
    match cell {
        Cell::Unknown => ' ',
        Cell::Visited => '.',
        Cell::Cleared => '-',
        Cell::Current => '@',
        Cell::Boss => 'B',
        Cell::Shop => '$',
        Cell::Shrine => '+',
        Cell::Exit => '>',
    }
}

/// PETSCII screen codes for the same cells, using the C64 graphics set:
/// filled/hollow circles and shifted letters that render upright.
fn petscii_byte(cell: Cell) -> u8 {
    match cell {
        Cell::Unknown => 0x20,
        Cell::Visited => 0x2E,
        Cell::Cleared => 0xDB,
        Cell::Current => 0xD1,
        Cell::Boss => b'B' + 0x80,
        Cell::Shop => b'$',
        Cell::Shrine => 0xDB,
        Cell::Exit => b'>',
    }
}

fn ink_for(cell: Cell) -> Ink {
    match cell {
        Cell::Current => Ink::Prompt,
        Cell::Boss => Ink::Warn,
        Cell::Shop | Cell::Shrine => Ink::Accent,
        Cell::Exit => Ink::Accent,
        Cell::Cleared => Ink::Body,
        Cell::Visited => Ink::Dim,
        Cell::Unknown => Ink::Dim,
    }
}

fn cell_width(term: Term) -> usize {
    match term {
        Term::Petscii => 2,
        Term::Ansi => 4,
    }
}

/// Widest grid that fits the caller's screen, so a 40-column C64 gets a
/// smaller window rather than a wrapped one.
pub fn fits(screen: &Screen, width: usize) -> usize {
    let usable = screen.width.saturating_sub(2);
    (usable / cell_width(screen.term)).max(1).min(width)
}

/// Draw the grid. ANSI gets corridor runs between cells; PETSCII keeps one
/// space so the map stays inside 40 columns.
pub fn draw(screen: &mut Screen, grid: &Grid) {
    for y in 0..grid.height {
        screen.text(" ");
        for x in 0..grid.width {
            let (cell, links) = grid.at(x, y);
            screen.ink(ink_for(cell));
            match screen.term {
                Term::Petscii => {
                    let b = petscii_byte(cell);
                    screen.raw(&[b]);
                    screen.raw(&[if links.east { 0xC0 } else { 0x20 }]);
                }
                Term::Ansi => {
                    screen.text(&ascii_glyph(cell).to_string());
                    screen.ink(Ink::Dim);
                    screen.text(if links.east { "---" } else { "   " });
                }
            }
        }
        screen.reset().nl();

        if y + 1 < grid.height {
            screen.text(" ");
            for x in 0..grid.width {
                let (_, links) = grid.at(x, y);
                screen.ink(Ink::Dim);
                match screen.term {
                    Term::Petscii => {
                        screen.raw(&[if links.south { 0xDD } else { 0x20 }, 0x20]);
                    }
                    Term::Ansi => {
                        screen.text(if links.south { "|" } else { " " });
                        screen.text("   ");
                    }
                }
            }
            screen.reset().nl();
        }
    }
}

/// One-line key so the glyphs are readable without a manual.
pub fn legend(screen: &mut Screen) {
    let pairs: &[(Cell, &str)] = &[
        (Cell::Current, "you"),
        (Cell::Boss, "boss"),
        (Cell::Shop, "shop"),
        (Cell::Shrine, "rest"),
        (Cell::Visited, "seen"),
    ];
    screen.ink(Ink::Dim);
    for (cell, label) in pairs {
        match screen.term {
            Term::Petscii => {
                screen.raw(&[petscii_byte(*cell)]);
            }
            Term::Ansi => {
                screen.text(&ascii_glyph(*cell).to_string());
            }
        }
        screen.text(&format!("={label} "));
    }
    screen.reset().nl();
}
