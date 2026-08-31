use holy::Sanitize;

#[derive(Sanitize)]
pub struct Bad {
    #[holy(validate = "emial")]
    pub email: String,
}

fn main() {}
