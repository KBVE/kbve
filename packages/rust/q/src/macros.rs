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
                    godot_print!(
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
