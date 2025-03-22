#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        let result = 2 + 2;
        assert_eq!(result, 4);
    }
}


pub mod builder;
pub mod entity;
pub mod state;

pub use builder::*;
pub use entity::*;
pub use state::*;