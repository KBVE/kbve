fn main() {
    for key in ["WIFI_SSID", "WIFI_PASSWORD", "BBS_HOST"] {
        println!("cargo::rerun-if-env-changed={key}");
    }
    println!("cargo::rerun-if-changed=wifi.env");
}
