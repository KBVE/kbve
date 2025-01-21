use godot::classes::{Button, CanvasLayer, ICanvasLayer, Label, Timer};
use godot::prelude::*;

#[derive(GodotClass)]
#[class(base=CanvasLayer)]
pub struct Maiky {
    base: Base<CanvasLayer>,
}

#[godot_api]
impl Maiky {
    #[signal]
    fn start_game();

    #[func]
    pub fn example_show_message(&self, text: GString) {
        let mut message_label = self.base().get_node_as::<Label>("MessageLabel");
        message_label.set_text(&text);
        message_label.show();

        let mut timer = self.base().get_node_as::<Timer>("MessageTimer");
        timer.start();
    }

    #[func]
    pub fn show_message(&mut self, text: GString) {
        let mut message_label = if let Some(label) = self.base().try_get_node_as::<Label>("MessageLabel") {
            label
        } else {
            let mut new_label = Label::new_alloc();
            new_label.set_name("MessageLabel");
            self.base_mut().add_child(&new_label);
            new_label
        };
    
        message_label.set_text(&text);
        message_label.show();
    
        let mut message_timer = if let Some(timer) = self.base().try_get_node_as::<Timer>("MessageTimer") {
            timer
        } else {
            let mut new_timer = Timer::new_alloc();
            new_timer.set_name("MessageTimer");
            new_timer.set_one_shot(true);
            new_timer.set_wait_time(5.0);
            self.base_mut().add_child(&new_timer);
            new_timer.connect("timeout", &self.base().callable("on_message_timer_timeout"));
            new_timer
        };
    
        message_timer.start();
    }
    
    

    pub fn show_game_over(&mut self) {
        self.show_message("Game Over".into());

        let mut timer = self.base().get_tree().unwrap().create_timer(2.0).unwrap();
        timer.connect("timeout", &self.base().callable("show_start_button"));
    }

    #[func]
    fn show_start_button(&mut self) {
        let mut message_label = self.base().get_node_as::<Label>("MessageLabel");
        message_label.set_text("Dodge the\nCreeps!");
        message_label.show();

        let mut button = self.base().get_node_as::<Button>("StartButton");
        button.show();
    }

    #[func]
    pub fn update_score(&self, score: i64) {
        let mut label = self.base().get_node_as::<Label>("ScoreLabel");

        label.set_text(&score.to_string());
    }

    #[func]
    fn on_start_button_pressed(&mut self) {
        let mut button = self.base().get_node_as::<Button>("StartButton");
        button.hide();

        // Note: this works only because `start_game` is a deferred signal.
        // This method keeps a &mut Hud, and start_game calls Main::new_game(), which itself accesses this Hud
        // instance through Gd<Hud>::bind_mut(). It will try creating a 2nd &mut reference, and thus panic.
        // Deferring the signal is one option to work around it.
        self.base_mut().emit_signal("start_game", &[]);
    }

    #[func]
    fn on_message_timer_timeout(&self) {
        let mut message_label = self.base().get_node_as::<Label>("MessageLabel");
        message_label.hide()
    }
}

#[godot_api]
impl ICanvasLayer for Maiky {
    fn init(base: Base<Self::Base>) -> Self {
        Self { base }
    }
}