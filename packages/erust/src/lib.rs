#![warn(clippy::all, rust_2018_idioms)]

//  * [MODS]

pub mod ironatom;
pub mod applicationstate;
pub mod widgets;
pub mod state;

pub use ironatom::*;
pub use applicationstate::*;
pub use widgets::*;
pub use state::*;


#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        let result = 2 + 2;
        assert_eq!(result, 4);
    }
}
