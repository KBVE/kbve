#![warn(clippy::all, rust_2018_idioms)]

//  * [MODS]

pub mod ironatom;
pub mod applicationstate;

pub use ironatom::*;
pub use applicationstate::*;


#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        let result = 2 + 2;
        assert_eq!(result, 4);
    }
}
