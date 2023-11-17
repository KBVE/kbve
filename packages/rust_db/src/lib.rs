//  * [MODS]
pub mod db;
pub mod models;
pub mod schema;

// *  [USE]
pub use db::*;
pub use models::*;
pub use schema::*;

// #[cfg(test)]
// mod tests {
//     #[test]
//     fn it_works() {
//         let result = 2 + 2;
//         assert_eq!(result, 4);
//     }
// }
