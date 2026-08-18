use super::*;

const HOUR: f32 = 60.0;

fn day() -> Day {
    let mut day = Day::new(HOUR);
    day.set_speed(1.0);
    day.push(Stop::new([0.0, 0.0], 6.0));
    day.push(Stop::new([30.0, 0.0], 12.0));
    day.push(Stop::new([30.0, 30.0], 18.0));
    day
}

#[test]
fn a_day_with_no_stops_asks_for_nothing() {
    assert_eq!(Day::new(HOUR).at(9.0), None);
}

#[test]
fn stops_are_kept_in_the_order_of_the_clock() {
    let mut day = Day::new(HOUR);
    day.push(Stop::new([0.0, 0.0], 18.0));
    day.push(Stop::new([1.0, 0.0], 6.0));
    assert_eq!(day.stops()[0].hour, 6.0);
}

#[test]
fn setting_off_walks_from_the_last_place_toward_the_next() {
    let out = day().at(12.0 + 10.0 / 60.0).unwrap();
    assert!(out.walking);
    assert!(
        (out.at[0] - 10.0).abs() < 0.5,
        "ten minutes at a metre a second is ten metres, got {:?}",
        out.at
    );
    assert!((out.heading[0] - 1.0).abs() < 1e-4);
}

#[test]
fn arriving_early_means_standing_there_until_the_next_hour() {
    let out = day().at(14.0).unwrap();
    assert!(!out.walking);
    assert_eq!(out.at, [30.0, 0.0]);
    assert_eq!(out.heading, [0.0, 0.0]);
}

#[test]
fn the_small_hours_are_spent_at_the_last_stop_of_the_day() {
    let out = day().at(3.0).unwrap();
    assert!(!out.walking);
    assert_eq!(out.at, [30.0, 30.0]);
}

#[test]
fn the_first_stop_is_walked_to_from_the_last_one() {
    let out = day().at(6.0 + 1.0 / 60.0).unwrap();
    assert!(out.walking, "nobody set off for the first stop of the day");
    assert!(
        out.at[1] < 30.0 && out.at[1] > 25.0,
        "should be a minute out of the overnight stop, got {:?}",
        out.at
    );
}

#[test]
fn two_machines_asking_at_the_same_hour_get_the_same_answer() {
    let mine = day();
    let theirs = day();
    for step in 0..(24 * 12) {
        let hour = step as f32 / 12.0;
        assert_eq!(mine.at(hour), theirs.at(hour), "disagreed at hour {hour}");
    }
}

#[test]
fn joining_late_does_not_change_where_anybody_is() {
    let day = day();
    let mut walked = day.at(0.0).unwrap();
    for step in 1..(24 * 60) {
        walked = day.at(step as f32 / 60.0).unwrap();
    }
    assert_eq!(walked, day.at(23.0 + 59.0 / 60.0).unwrap());
}

#[test]
fn a_faster_walker_is_further_along() {
    let mut quick = day();
    quick.set_speed(4.0);
    let hour = 12.0 + 5.0 / 60.0;
    assert!(quick.at(hour).unwrap().at[0] > day().at(hour).unwrap().at[0]);
}

#[test]
fn a_longer_day_stretches_the_walk() {
    let mut slow = day();
    slow.set_hour_seconds(HOUR * 4.0);
    let hour = 12.0 + 5.0 / 60.0;
    assert!(slow.at(hour).unwrap().at[0] > day().at(hour).unwrap().at[0]);
}

#[test]
fn a_stop_in_the_same_place_as_the_last_is_stood_at_not_walked_to() {
    let mut day = Day::new(HOUR);
    day.push(Stop::new([4.0, 4.0], 6.0));
    day.push(Stop::new([4.0, 4.0], 18.0));
    let out = day.at(18.0 + 1.0 / 60.0).unwrap();
    assert!(!out.walking);
    assert_eq!(out.at, [4.0, 4.0]);
}

#[test]
fn one_stop_is_a_place_to_stand_all_day() {
    let mut day = Day::new(HOUR);
    day.push(Stop::new([2.0, 7.0], 9.0));
    for step in 0..24 {
        let out = day.at(step as f32).unwrap();
        assert_eq!(out.at, [2.0, 7.0]);
        assert!(!out.walking);
    }
}
