
use rust_db::db;

fn main() {
  println!("Hello, world! This is my first line of rust! Poppin das.");
  match db::establish_connection_prod() {
    Ok(connection) => {
        // Use the connection
        println!("Successfully connected to the production database.");
        // ... do something with the connection ...
    }
    Err(err) => {
        eprintln!("Failed to connect to the production database: {}", err);
    }
}
}
