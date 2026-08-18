#[cfg(feature = "client")]
pub mod bridge;

#[cfg(test)]
mod tests;

pub type Vec2 = [f32; 2];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Style {
    Loop,
    PingPong,
    Once,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Post {
    pub at: Vec2,
    pub dwell: f32,
}

impl Post {
    pub fn new(at: Vec2, dwell: f32) -> Self {
        Self {
            at,
            dwell: dwell.max(0.0),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Doing {
    Walking,
    Dwelling,
    Held,
    Done,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Step {
    pub wish: Vec2,
    pub target: Vec2,
    pub doing: Doing,
    pub post: usize,
    pub arrived: bool,
}

pub const ARRIVE: f32 = 0.45;

#[derive(Clone, Debug)]
pub struct Walk {
    posts: Vec<Post>,
    style: Style,
    arrive: f32,
    post: usize,
    forward: bool,
    waiting: f32,
    held: bool,
    done: bool,
}

impl Default for Walk {
    fn default() -> Self {
        Self::new(Vec::new(), Style::Loop)
    }
}

impl Walk {
    pub fn new(posts: Vec<Post>, style: Style) -> Self {
        Self {
            posts,
            style,
            arrive: ARRIVE,
            post: 0,
            forward: true,
            waiting: 0.0,
            held: false,
            done: false,
        }
    }

    pub fn push(&mut self, post: Post) {
        self.posts.push(post);
        self.done = false;
    }

    pub fn posts(&self) -> &[Post] {
        &self.posts
    }

    pub fn set_style(&mut self, style: Style) {
        self.style = style;
        if style != Style::Once {
            self.done = false;
        }
    }

    pub fn set_arrive(&mut self, radius: f32) {
        self.arrive = radius.max(0.01);
    }

    pub fn hold(&mut self, held: bool) {
        self.held = held;
    }

    pub fn is_held(&self) -> bool {
        self.held
    }

    pub fn head_for(&mut self, post: usize) {
        if post >= self.posts.len() {
            return;
        }
        self.post = post;
        self.waiting = 0.0;
        self.done = false;
    }

    pub fn post(&self) -> usize {
        self.post
    }

    pub fn target(&self) -> Option<Vec2> {
        self.posts.get(self.post).map(|p| p.at)
    }

    pub fn step(&mut self, position: Vec2, delta: f32) -> Step {
        let Some(post) = self.posts.get(self.post).copied() else {
            return self.standing(position, Doing::Done);
        };
        if self.done {
            return self.standing(post.at, Doing::Done);
        }
        if self.held {
            return self.standing(post.at, Doing::Held);
        }
        if self.waiting > 0.0 {
            self.waiting = (self.waiting - delta.max(0.0)).max(0.0);
            if self.waiting > 0.0 {
                return self.standing(post.at, Doing::Dwelling);
            }
            self.advance();
            let target = self.target().unwrap_or(post.at);
            return self.standing(target, self.moving_or_done());
        }

        let to = [post.at[0] - position[0], post.at[1] - position[1]];
        let far = (to[0] * to[0] + to[1] * to[1]).sqrt();
        if far <= self.arrive {
            self.waiting = post.dwell;
            if self.waiting <= 0.0 {
                self.advance();
            }
            return Step {
                wish: [0.0, 0.0],
                target: post.at,
                doing: if self.done {
                    Doing::Done
                } else {
                    Doing::Dwelling
                },
                post: self.post,
                arrived: true,
            };
        }

        Step {
            wish: [to[0] / far, to[1] / far],
            target: post.at,
            doing: Doing::Walking,
            post: self.post,
            arrived: false,
        }
    }

    fn moving_or_done(&self) -> Doing {
        if self.done {
            Doing::Done
        } else {
            Doing::Walking
        }
    }

    fn standing(&self, target: Vec2, doing: Doing) -> Step {
        Step {
            wish: [0.0, 0.0],
            target,
            doing,
            post: self.post,
            arrived: false,
        }
    }

    fn advance(&mut self) {
        let last = self.posts.len().saturating_sub(1);
        if last == 0 {
            self.done = self.style == Style::Once;
            return;
        }
        match self.style {
            Style::Loop => self.post = (self.post + 1) % self.posts.len(),
            Style::Once => {
                if self.post >= last {
                    self.done = true;
                } else {
                    self.post += 1;
                }
            }
            Style::PingPong => {
                if self.forward {
                    if self.post >= last {
                        self.forward = false;
                        self.post = last - 1;
                    } else {
                        self.post += 1;
                    }
                } else if self.post == 0 {
                    self.forward = true;
                    self.post = 1;
                } else {
                    self.post -= 1;
                }
            }
        }
    }
}
