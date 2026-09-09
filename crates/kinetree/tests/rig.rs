use kinetree::{Bone, Side, Skeleton, arm, leg, role_of};

#[test]
fn the_unreal_convention_is_recognised() {
    assert_eq!(role_of("root"), Some(Bone::Root));
    assert_eq!(role_of("pelvis"), Some(Bone::Pelvis));
    assert_eq!(role_of("upperarm_l"), Some(Bone::UpperArm(Side::Left)));
    assert_eq!(role_of("lowerarm_r"), Some(Bone::LowerArm(Side::Right)));
    assert_eq!(role_of("hand_r"), Some(Bone::Hand(Side::Right)));
    assert_eq!(role_of("thigh_l"), Some(Bone::Thigh(Side::Left)));
    assert_eq!(role_of("calf_l"), Some(Bone::Calf(Side::Left)));
    assert_eq!(role_of("foot_r"), Some(Bone::Foot(Side::Right)));
    assert_eq!(role_of("ball_r"), Some(Bone::Ball(Side::Right)));
    assert_eq!(role_of("clavicle_l"), Some(Bone::Clavicle(Side::Left)));
}

#[test]
fn the_mixamo_convention_is_recognised() {
    assert_eq!(role_of("mixamorig:Hips"), Some(Bone::Pelvis));
    assert_eq!(
        role_of("mixamorig:LeftForeArm"),
        Some(Bone::LowerArm(Side::Left))
    );
    assert_eq!(
        role_of("mixamorig:RightArm"),
        Some(Bone::UpperArm(Side::Right))
    );
    assert_eq!(
        role_of("mixamorig:LeftShoulder"),
        Some(Bone::Clavicle(Side::Left))
    );
    assert_eq!(
        role_of("mixamorig:RightUpLeg"),
        Some(Bone::Thigh(Side::Right))
    );
    assert_eq!(role_of("mixamorig:LeftLeg"), Some(Bone::Calf(Side::Left)));
    assert_eq!(
        role_of("mixamorig:RightToeBase"),
        Some(Bone::Ball(Side::Right))
    );
    // The prefix is optional: plenty of exporters drop it.
    assert_eq!(role_of("LeftForeArm"), Some(Bone::LowerArm(Side::Left)));
}

#[test]
fn spine_numbering_is_normalised_across_conventions() {
    // Unreal counts from one, Mixamo starts unnumbered. Both land on the same
    // zero-based index, which is the whole point -- a five-spine rig and a
    // three-spine rig can then be compared at all.
    assert_eq!(role_of("spine_01"), Some(Bone::Spine(0)));
    assert_eq!(role_of("spine_05"), Some(Bone::Spine(4)));
    assert_eq!(role_of("mixamorig:Spine"), Some(Bone::Spine(0)));
    assert_eq!(role_of("mixamorig:Spine2"), Some(Bone::Spine(2)));
}

#[test]
fn helper_bones_are_not_mistaken_for_the_joints_they_are_named_after() {
    // Every one of these is real, taken from the UE5 mannequin. Each shares a
    // stem with a load-bearing bone, and treating any of them as that bone
    // would drive the solver from a twist correction.
    for noise in [
        "calf_twist_01_l",
        "calf_correctiveRoot_l",
        "calf_knee_l",
        "calf_l_back_120",
        "upperarm_twist_02_r",
        "thigh_bck_l",
        "thigh_fwd_r",
        "clavicle_out_l",
    ] {
        assert_eq!(role_of(noise), None, "{noise} should have no role");
    }
}

#[test]
fn capitalisation_does_not_matter() {
    assert_eq!(role_of("UpperArm_L"), Some(Bone::UpperArm(Side::Left)));
    assert_eq!(role_of("PELVIS"), Some(Bone::Pelvis));
    assert_eq!(role_of("MixamoRig:leftHand"), Some(Bone::Hand(Side::Left)));
}

#[test]
fn unknown_bones_are_declined_rather_than_guessed() {
    for unknown in ["ik_hand_gun", "weapon_r", "prop_socket", "", "_", "spine_"] {
        assert_eq!(role_of(unknown), None, "{unknown} should have no role");
    }
}

#[test]
fn only_the_real_hinges_are_hinges() {
    assert!(Bone::Calf(Side::Left).is_hinge());
    assert!(Bone::LowerArm(Side::Right).is_hinge());
    // A shoulder and a hip are ball joints; solving them on one axis would be
    // wrong, and an unconstrained chain solver must not be told otherwise.
    assert!(!Bone::UpperArm(Side::Left).is_hinge());
    assert!(!Bone::Thigh(Side::Right).is_hinge());
    assert!(!Bone::Pelvis.is_hinge());
}

#[test]
fn limb_chains_name_the_bones_a_solver_wants() {
    assert_eq!(
        arm(Side::Right),
        [
            Bone::UpperArm(Side::Right),
            Bone::LowerArm(Side::Right),
            Bone::Hand(Side::Right)
        ]
    );
    assert_eq!(
        leg(Side::Left),
        [
            Bone::Thigh(Side::Left),
            Bone::Calf(Side::Left),
            Bone::Foot(Side::Left)
        ]
    );
    assert_eq!(arm(Side::Left)[1].side(), Some(Side::Left));
    assert_eq!(Bone::Pelvis.side(), None);
}

#[test]
fn every_role_gets_its_own_slot() {
    // A collision here would have two joints sharing a table entry, which shows
    // up later as an arm being driven by a leg.
    let mut seen = [false; Bone::COUNT];
    let mut roles = vec![Bone::Root, Bone::Pelvis, Bone::Neck, Bone::Head];
    for i in 0..kinetree::MAX_SPINE {
        roles.push(Bone::Spine(i as u8));
    }
    for side in [Side::Left, Side::Right] {
        roles.extend([
            Bone::Clavicle(side),
            Bone::UpperArm(side),
            Bone::LowerArm(side),
            Bone::Hand(side),
            Bone::Thigh(side),
            Bone::Calf(side),
            Bone::Foot(side),
            Bone::Ball(side),
        ]);
    }

    assert_eq!(roles.len(), Bone::COUNT, "COUNT disagrees with the roles");
    for role in roles {
        let index = role.index();
        assert!(index < Bone::COUNT, "{role:?} indexes past the table");
        assert!(!seen[index], "{role:?} collides with another role");
        seen[index] = true;
    }
    assert!(seen.iter().all(|hit| *hit), "a slot is unreachable");
}

#[test]
fn a_spine_beyond_the_table_clamps_rather_than_wrapping() {
    // Wrapping would put a seventh spine bone on top of the first, and drive
    // the hips from the chest.
    let last = Bone::Spine((kinetree::MAX_SPINE - 1) as u8).index();
    assert_eq!(Bone::Spine(200).index(), last);
    assert!(Bone::Spine(200).index() < Bone::COUNT);
}

#[test]
fn a_skeleton_learns_once_and_is_numeric_afterwards() {
    // The UE5 mannequin's arm, with the twist and corrective bones it really
    // carries between the joints.
    let names: Vec<(u16, &str)> = vec![
        (0, "root"),
        (1, "pelvis"),
        (2, "spine_01"),
        (3, "spine_02"),
        (4, "spine_03"),
        (5, "spine_04"),
        (6, "spine_05"),
        (7, "clavicle_r"),
        (8, "upperarm_r"),
        (9, "upperarm_twist_01_r"),
        (10, "lowerarm_r"),
        (11, "lowerarm_twist_01_r"),
        (12, "hand_r"),
        (13, "ik_hand_gun"),
    ];

    let mut skeleton = Skeleton::new();
    let found = skeleton.learn(names);

    // Fourteen names in, three of them helpers: two twists and an IK marker.
    assert_eq!(
        found, 11,
        "the twist and IK bones should not have been mapped"
    );
    assert_eq!(skeleton.get(Bone::UpperArm(Side::Right)), Some(8));
    assert_eq!(skeleton.get(Bone::Hand(Side::Right)), Some(12));
    assert_eq!(skeleton.get(Bone::Hand(Side::Left)), None);

    // The arm chain, as three array subscripts and no strings.
    assert_eq!(skeleton.chain(arm(Side::Right)), Some([8, 10, 12]));
    assert_eq!(skeleton.chain(arm(Side::Left)), None);

    // Five spine bones, and the chest is the last of them.
    assert_eq!(skeleton.chest(), Some(6));
}

#[test]
fn a_three_spine_rig_answers_the_same_question() {
    // The same call finds the chest on our own skeleton, which has three.
    let mut skeleton = Skeleton::new();
    skeleton.learn(vec![
        (0u16, "root"),
        (1, "pelvis"),
        (2, "spine_01"),
        (3, "spine_02"),
        (4, "spine_03"),
        (5, "clavicle_l"),
    ]);

    assert_eq!(skeleton.chest(), Some(4));
}

#[test]
fn mixamo_and_unreal_rigs_produce_the_same_table() {
    let mut unreal = Skeleton::new();
    unreal.learn(vec![
        (0u16, "pelvis"),
        (1, "thigh_l"),
        (2, "calf_l"),
        (3, "foot_l"),
    ]);

    let mut mixamo = Skeleton::new();
    mixamo.learn(vec![
        (0u16, "mixamorig:Hips"),
        (1, "mixamorig:LeftUpLeg"),
        (2, "mixamorig:LeftLeg"),
        (3, "mixamorig:LeftFoot"),
    ]);

    // Two different naming conventions, one identical numeric answer -- which
    // is the entire reason this module exists.
    assert_eq!(unreal.chain(leg(Side::Left)), mixamo.chain(leg(Side::Left)));
    assert_eq!(unreal.chain(leg(Side::Left)), Some([1, 2, 3]));
}

#[test]
fn the_table_is_plain_numbers() {
    // It has to cross into Unreal through `unr` untouched, so it must stay
    // pointer-free and the size of its array.
    assert_eq!(
        core::mem::size_of::<Skeleton>(),
        Bone::COUNT * core::mem::size_of::<u16>()
    );
}
