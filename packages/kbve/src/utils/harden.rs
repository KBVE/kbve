pub fn sanitize_input(input: &str) -> String {
    let mut sanitized: String = input
        .chars()
        .filter(|c| c.is_alphanumeric() && c.is_ascii())
        .collect();

    if sanitized.len() > 255 {
        sanitized.truncate(255);
    }

    sanitized
}