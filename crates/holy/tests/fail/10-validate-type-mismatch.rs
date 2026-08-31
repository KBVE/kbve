use holy::Sanitize;

#[derive(Sanitize)]
pub struct Bad {
    #[holy(validate = "non_empty")]
    pub age: u32,
}

fn main() {}
