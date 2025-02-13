#[macro_export]
macro_rules! connect_signal {
    ($obj:expr, $signal:expr, $method:expr) => {{
        let callable = $obj.base().callable($method);
        if !$obj.base().is_connected($signal, &callable) {
            $obj.base_mut().connect($signal, &callable);
        }
    }};
}