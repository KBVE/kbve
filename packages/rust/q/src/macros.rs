#[macro_export]
macro_rules! debug_print {
    ($($arg:tt)*) => {
        #[cfg(debug_assertions)]
        godot_print!($($arg)*);
    };
}

#[macro_export]
macro_rules! impl_node_ext_common {
    ($trait_name:ident, $gd_type:ty { $($extra:tt)* }) => {
        impl $trait_name for Gd<$gd_type> {
            fn with_name(mut self, name: &str) -> Self {
                self.set_name(name);
                self
            }

            fn with_cache(self, prefix: &str, key: &GString) -> Self {
                self.with_name(&format!("{}_{}", prefix, key))
            }

            $($extra)*
        }
    };
}

#[macro_export]
macro_rules! connect_signal {
    ($obj:expr, $signal:expr, $method:expr) => {{
        let callable = $obj.base().callable($method);
        if !$obj.base().is_connected($signal, &callable) {
            $obj.base_mut().connect($signal, &callable);
        }
    }};
}

#[macro_export]
macro_rules! find_game_manager {
    ($self:ident) => {
        match $self.base().get_parent() {
            Some(parent) => {
                let game_manager: Gd<GameManager> = parent.cast::<GameManager>();
                if game_manager.clone().upcast::<Node>().is_instance_valid() {
                    $self.game_manager = Some(game_manager);
                    debug_print!(
                        "[{}:{}] [{}] Successfully linked with GameManager.",
                        file!(),
                        line!(),
                        module_path!()
                    );
                } else {
                    godot_warn!(
                        "[{}:{}] [{}] Failed to initialize: GameManager is invalid.",
                        file!(),
                        line!(),
                        module_path!()
                    );
                }
            }
            None => godot_warn!(
                "[{}:{}] [{}] Failed to initialize: No parent node found.",
                file!(),
                line!(),
                module_path!()
            ),
        }
    };
}
