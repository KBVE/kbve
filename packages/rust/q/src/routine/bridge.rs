use godot::prelude::*;

use super::{Doing, Post, Style, Vec2, Walk};

fn flat(v: Vector3) -> Vec2 {
    [v.x, v.z]
}

fn wide(v: Vec2) -> Vector3 {
    Vector3::new(v[0], 0.0, v[1])
}

fn doing_id(doing: Doing) -> i64 {
    match doing {
        Doing::Walking => 0,
        Doing::Dwelling => 1,
        Doing::Held => 2,
        Doing::Done => 3,
    }
}

#[derive(GodotClass)]
#[class(no_init, base = RefCounted)]
pub struct QRoutine {
    base: Base<RefCounted>,
    inner: Walk,
}

#[godot_api]
impl QRoutine {
    #[constant]
    pub const STYLE_LOOP: i64 = 0;
    #[constant]
    pub const STYLE_PING_PONG: i64 = 1;
    #[constant]
    pub const STYLE_ONCE: i64 = 2;

    #[constant]
    pub const DOING_WALKING: i64 = 0;
    #[constant]
    pub const DOING_DWELLING: i64 = 1;
    #[constant]
    pub const DOING_HELD: i64 = 2;
    #[constant]
    pub const DOING_DONE: i64 = 3;

    #[func]
    fn create() -> Gd<Self> {
        Gd::from_init_fn(|base| Self {
            base,
            inner: Walk::default(),
        })
    }

    #[func]
    fn add_post(&mut self, at: Vector3, dwell: f32) {
        self.inner.push(Post::new(flat(at), dwell));
    }

    #[func]
    fn post_count(&self) -> i64 {
        self.inner.posts().len() as i64
    }

    #[func]
    fn set_style(&mut self, style: i64) {
        self.inner.set_style(match style {
            1 => Style::PingPong,
            2 => Style::Once,
            _ => Style::Loop,
        });
    }

    #[func]
    fn set_arrive(&mut self, radius: f32) {
        self.inner.set_arrive(radius);
    }

    #[func]
    fn hold(&mut self, held: bool) {
        self.inner.hold(held);
    }

    #[func]
    fn is_held(&self) -> bool {
        self.inner.is_held()
    }

    #[func]
    fn head_for(&mut self, post: i64) {
        if post >= 0 {
            self.inner.head_for(post as usize);
        }
    }

    #[func]
    fn post(&self) -> i64 {
        self.inner.post() as i64
    }

    #[func]
    fn step(&mut self, position: Vector3, delta: f32) -> VarDictionary {
        let step = self.inner.step(flat(position), delta);
        let mut out = VarDictionary::new();
        out.set("wish", wide(step.wish));
        out.set("target", wide(step.target));
        out.set("doing", doing_id(step.doing));
        out.set("post", step.post as i64);
        out.set("arrived", step.arrived);
        out
    }
}
