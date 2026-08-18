use super::*;

fn route(style: Style) -> Walk {
    Walk::new(
        vec![
            Post::new([0.0, 0.0], 1.0),
            Post::new([10.0, 0.0], 1.0),
            Post::new([10.0, 10.0], 1.0),
        ],
        style,
    )
}

fn travel(walk: &mut Walk, from: Vec2, ticks: usize, speed: f32) -> (Vec2, Vec<usize>) {
    let delta = 0.1;
    let mut at = from;
    let mut stops = Vec::new();
    for _ in 0..ticks {
        let step = walk.step(at, delta);
        if step.arrived {
            stops.push(step.post);
        }
        at[0] += step.wish[0] * speed * delta;
        at[1] += step.wish[1] * speed * delta;
    }
    (at, stops)
}

#[test]
fn an_empty_route_asks_for_nothing() {
    let mut walk = Walk::default();
    let step = walk.step([3.0, 4.0], 0.1);
    assert_eq!(step.wish, [0.0, 0.0]);
    assert_eq!(step.doing, Doing::Done);
}

#[test]
fn the_wish_points_at_the_post() {
    let mut walk = Walk::new(vec![Post::new([0.0, 6.0], 0.0)], Style::Once);
    let step = walk.step([0.0, 0.0], 0.1);
    assert_eq!(step.doing, Doing::Walking);
    assert!(
        (step.wish[1] - 1.0).abs() < 1e-5,
        "wish was {:?}",
        step.wish
    );
    assert_eq!(step.target, [0.0, 6.0]);
}

#[test]
fn arriving_is_reported_once_and_then_waited_out() {
    let mut walk = Walk::new(vec![Post::new([0.0, 0.0], 2.0)], Style::Loop);
    let first = walk.step([0.1, 0.0], 0.1);
    assert!(first.arrived);
    assert_eq!(first.doing, Doing::Dwelling);
    let second = walk.step([0.1, 0.0], 0.1);
    assert!(!second.arrived, "arrival was reported twice");
    assert_eq!(second.doing, Doing::Dwelling);
}

#[test]
fn a_looping_route_comes_back_round() {
    let mut walk = route(Style::Loop);
    let (_, stops) = travel(&mut walk, [0.0, 0.0], 900, 4.0);
    assert!(
        stops.len() > 3,
        "only stopped at {stops:?}, so it never came round"
    );
    assert_eq!(&stops[..4], &[0, 1, 2, 0], "stopped at {stops:?}");
}

#[test]
fn a_ping_pong_route_turns_back_at_the_end() {
    let mut walk = route(Style::PingPong);
    let (_, stops) = travel(&mut walk, [0.0, 0.0], 900, 4.0);
    assert!(stops.len() > 4, "only stopped at {stops:?}");
    assert_eq!(&stops[..5], &[0, 1, 2, 1, 0], "stopped at {stops:?}");
}

#[test]
fn a_once_route_stops_at_the_last_post() {
    let mut walk = route(Style::Once);
    let (at, _) = travel(&mut walk, [0.0, 0.0], 2000, 4.0);
    let last = walk.posts()[2].at;
    assert!(
        (at[0] - last[0]).abs() < 1.0 && (at[1] - last[1]).abs() < 1.0,
        "ended at {at:?}, not at {last:?}"
    );
    assert_eq!(walk.step(at, 0.1).doing, Doing::Done);
}

#[test]
fn a_held_body_stays_where_it_is() {
    let mut walk = route(Style::Loop);
    walk.hold(true);
    let (at, stops) = travel(&mut walk, [0.0, 5.0], 200, 4.0);
    assert_eq!(at, [0.0, 5.0], "a held body moved");
    assert!(stops.is_empty(), "a held body reached {stops:?}");
}

#[test]
fn releasing_a_hold_resumes_the_wait_rather_than_restarting_it() {
    let mut walk = Walk::new(vec![Post::new([0.0, 0.0], 2.0)], Style::Loop);
    walk.step([0.0, 0.0], 0.1);
    for _ in 0..15 {
        walk.step([0.0, 0.0], 0.1);
    }
    walk.hold(true);
    for _ in 0..100 {
        assert_eq!(walk.step([0.0, 0.0], 0.1).doing, Doing::Held);
    }
    walk.hold(false);
    let mut left = 0;
    while walk.step([0.0, 0.0], 0.1).doing == Doing::Dwelling {
        left += 1;
        assert!(left < 50, "the wait restarted from the top");
    }
}

#[test]
fn heading_for_a_post_abandons_the_one_under_way() {
    let mut walk = route(Style::Loop);
    walk.head_for(2);
    let step = walk.step([0.0, 0.0], 0.1);
    assert_eq!(step.target, [10.0, 10.0]);
    assert_eq!(step.post, 2);
}

#[test]
fn a_post_that_is_not_there_is_refused() {
    let mut walk = route(Style::Loop);
    walk.head_for(9);
    assert_eq!(walk.post(), 0);
}

#[test]
fn the_same_deltas_walk_the_same_path() {
    let mut one = route(Style::PingPong);
    let mut two = route(Style::PingPong);
    assert_eq!(
        travel(&mut one, [1.0, 2.0], 600, 3.0),
        travel(&mut two, [1.0, 2.0], 600, 3.0)
    );
}
