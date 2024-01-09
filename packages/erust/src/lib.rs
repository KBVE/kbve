#![warn(clippy::all, rust_2018_idioms)]

//  * [MODS]

pub mod ironatom;

pub use ironatom::*;


#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        let result = 2 + 2;
        assert_eq!(result, 4);
    }
}
