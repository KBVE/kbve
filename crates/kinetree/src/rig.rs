//! What a bone *is*, independent of what a skeleton calls it.
//!
//! The solvers take positions and an axis and trust the caller to have picked
//! the right three bones. That is fine for one hand-wired rig and useless the
//! moment a second skeleton appears: `lowerarm_l`, `mixamorig:LeftForeArm` and
//! `LeftForeArm` are the same joint, and a UE5 skeleton reaches the shoulder
//! through five spine bones where an older one uses three.
//!
//! So this maps names to roles. It is the whole of what makes animation data
//! portable between skeletons -- and deliberately the only part of the crate
//! that knows names exist, because a solver that started matching strings would
//! stop being usable from a `no_std` server or across an FFI boundary.
//!
//! No allocation and no parsing: matching is over `&str`, and the caller keeps
//! whatever table it builds.

/// Which side of the body a paired bone is on.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Side {
    Left,
    Right,
}

/// A bone's job in a humanoid skeleton.
///
/// Spine segments carry an index from the hips upward rather than a name,
/// because the count genuinely differs between rigs -- UE5's mannequin has five
/// and the skeleton this game uses has three. Anything that wants "the chest"
/// should ask for the last spine rather than assume a number.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Bone {
    /// The motion-root at the floor, beneath the hips. Not every rig has one.
    Root,
    Pelvis,
    /// Zero-based, counting up from the pelvis.
    Spine(u8),
    Neck,
    Head,
    Clavicle(Side),
    UpperArm(Side),
    LowerArm(Side),
    Hand(Side),
    Thigh(Side),
    Calf(Side),
    Foot(Side),
    /// The ball of the foot, the joint the toes pivot on.
    Ball(Side),
}

impl Bone {
    /// The side, for bones that have one.
    pub const fn side(self) -> Option<Side> {
        match self {
            Self::Clavicle(side)
            | Self::UpperArm(side)
            | Self::LowerArm(side)
            | Self::Hand(side)
            | Self::Thigh(side)
            | Self::Calf(side)
            | Self::Foot(side)
            | Self::Ball(side) => Some(side),
            _ => None,
        }
    }

    /// Whether this joint is a hinge -- one axis, one direction.
    ///
    /// The joints for which [`solve_hinge`](crate::solve_hinge) is exact and
    /// for which an unconstrained chain solver will happily produce a knee that
    /// bends backwards.
    pub const fn is_hinge(self) -> bool {
        matches!(self, Self::LowerArm(_) | Self::Calf(_))
    }
}

/// Recognises a bone from its name, across the conventions we meet.
///
/// Handles the Unreal convention (`upperarm_l`, `spine_03`, `calf_r`), which
/// the Quaternius UBC rig and every Epic skeleton share, and the Mixamo one
/// (`mixamorig:LeftForeArm`), which most downloaded animation uses. Matching is
/// case-insensitive because exporters disagree about it.
///
/// Returns `None` for bones with no role: twist bones, correctives, IK markers,
/// props. That is the common case on a real skeleton and not an error -- the
/// UE5 mannequin carries hundreds of them.
pub fn role_of(name: &str) -> Option<Bone> {
    let bare = strip_ci(name, "mixamorig:").unwrap_or(name);
    unreal(bare).or_else(|| mixamo(bare))
}

/// Case-insensitive prefix strip, without lowercasing into a new string.
fn strip_ci<'a>(name: &'a str, prefix: &str) -> Option<&'a str> {
    let (head, tail) = name.split_at_checked(prefix.len())?;
    head.eq_ignore_ascii_case(prefix).then_some(tail)
}

/// Case-insensitive equality, so exporters can disagree about capitals.
#[inline]
fn is(name: &str, expected: &str) -> bool {
    name.eq_ignore_ascii_case(expected)
}

/// Whether `name` contains `needle`, ignoring case.
fn contains_ci(name: &str, needle: &str) -> bool {
    name.as_bytes()
        .windows(needle.len())
        .any(|window| window.eq_ignore_ascii_case(needle.as_bytes()))
}

/// The Unreal convention: `<part>_<l|r>`, spines numbered from one.
fn unreal(name: &str) -> Option<Bone> {
    // Twist, corrective and helper bones share the stem of a real bone
    // (`calf_twist_01_l`, `calf_correctiveRoot_l`) and must not be mistaken for
    // it, so anything with an extra segment is rejected before matching.
    const NOISE: [&str; 6] = ["twist", "corrective", "knee", "bck", "fwd", "out"];
    if NOISE.iter().any(|marker| contains_ci(name, marker)) {
        return None;
    }

    let (stem, side) = match name.rsplit_once('_') {
        Some((stem, tail)) if is(tail, "l") => (stem, Some(Side::Left)),
        Some((stem, tail)) if is(tail, "r") => (stem, Some(Side::Right)),
        _ => (name, None),
    };

    match side {
        None => {
            if is(stem, "root") {
                Some(Bone::Root)
            } else if is(stem, "pelvis") {
                Some(Bone::Pelvis)
            } else if is(stem, "head") {
                Some(Bone::Head)
            } else {
                numbered(name)
            }
        }
        Some(side) => {
            if is(stem, "clavicle") {
                Some(Bone::Clavicle(side))
            } else if is(stem, "upperarm") {
                Some(Bone::UpperArm(side))
            } else if is(stem, "lowerarm") {
                Some(Bone::LowerArm(side))
            } else if is(stem, "hand") {
                Some(Bone::Hand(side))
            } else if is(stem, "thigh") {
                Some(Bone::Thigh(side))
            } else if is(stem, "calf") {
                Some(Bone::Calf(side))
            } else if is(stem, "foot") {
                Some(Bone::Foot(side))
            } else if is(stem, "ball") {
                Some(Bone::Ball(side))
            } else {
                numbered(name)
            }
        }
    }
}

/// `spine_01`, `neck_01` -- numbered from one in the file, from zero here.
fn numbered(name: &str) -> Option<Bone> {
    let (stem, digits) = name.rsplit_once('_')?;
    let index: u8 = digits.parse().ok()?;
    if is(stem, "spine") {
        Some(Bone::Spine(index.saturating_sub(1)))
    } else if is(stem, "neck") {
        Some(Bone::Neck)
    } else {
        None
    }
}

/// The Mixamo convention: `LeftForeArm`, `Spine1`, `Hips`.
fn mixamo(name: &str) -> Option<Bone> {
    let (side, rest) = if let Some(rest) = strip_ci(name, "left") {
        (Some(Side::Left), rest)
    } else if let Some(rest) = strip_ci(name, "right") {
        (Some(Side::Right), rest)
    } else {
        (None, name)
    };

    match side {
        None => {
            if is(rest, "hips") {
                Some(Bone::Pelvis)
            // Mixamo's spine chain is `Spine`, `Spine1`, `Spine2`, so the
            // unnumbered one is the first.
            } else if is(rest, "spine") {
                Some(Bone::Spine(0))
            } else if is(rest, "neck") {
                Some(Bone::Neck)
            } else if is(rest, "head") {
                Some(Bone::Head)
            } else {
                strip_ci(rest, "spine")?.parse().ok().map(Bone::Spine)
            }
        }
        Some(side) => {
            if is(rest, "shoulder") {
                Some(Bone::Clavicle(side))
            } else if is(rest, "arm") {
                Some(Bone::UpperArm(side))
            } else if is(rest, "forearm") {
                Some(Bone::LowerArm(side))
            } else if is(rest, "hand") {
                Some(Bone::Hand(side))
            } else if is(rest, "upleg") {
                Some(Bone::Thigh(side))
            } else if is(rest, "leg") {
                Some(Bone::Calf(side))
            } else if is(rest, "foot") {
                Some(Bone::Foot(side))
            } else if is(rest, "toebase") {
                Some(Bone::Ball(side))
            } else {
                None
            }
        }
    }
}

/// How many spine segments a role table has room for.
///
/// Five covers the UE5 mannequin, three covers most everything else, and six
/// leaves a margin. A rig with more simply loses the topmost segments from the
/// table rather than failing to load.
pub const MAX_SPINE: usize = 6;

impl Bone {
    /// How many distinct roles exist.
    pub const COUNT: usize = 10 + 16;

    /// A dense index, so a role can address an array directly.
    ///
    /// This is the point of the whole module for anything performance-shaped:
    /// names are matched once when a skeleton loads, and everything after that
    /// is an array subscript. No hashing, no comparison, no strings in a frame.
    pub const fn index(self) -> usize {
        const CLAVICLE: usize = 0;
        const UPPERARM: usize = 1;
        const LOWERARM: usize = 2;
        const HAND: usize = 3;
        const THIGH: usize = 4;
        const CALF: usize = 5;
        const FOOT: usize = 6;
        const BALL: usize = 7;

        const fn sided(kind: usize, side: Side) -> usize {
            10 + kind * 2 + side as usize
        }

        match self {
            Self::Root => 0,
            Self::Pelvis => 1,
            Self::Neck => 2,
            Self::Head => 3,
            // Clamped rather than wrapped: a seventh spine bone collapsing onto
            // the first would silently drive the hips from the chest.
            Self::Spine(i) => {
                4 + if (i as usize) < MAX_SPINE {
                    i as usize
                } else {
                    MAX_SPINE - 1
                }
            }
            Self::Clavicle(side) => sided(CLAVICLE, side),
            Self::UpperArm(side) => sided(UPPERARM, side),
            Self::LowerArm(side) => sided(LOWERARM, side),
            Self::Hand(side) => sided(HAND, side),
            Self::Thigh(side) => sided(THIGH, side),
            Self::Calf(side) => sided(CALF, side),
            Self::Foot(side) => sided(FOOT, side),
            Self::Ball(side) => sided(BALL, side),
        }
    }
}

/// Nothing is mapped to this role.
///
/// A sentinel rather than an `Option<u16>` so the table stays a plain array of
/// numbers that can cross an FFI boundary untouched.
pub const UNMAPPED: u16 = u16::MAX;

/// Which bone of a particular skeleton fills each role.
///
/// Built once, from names, when a skeleton is loaded; read as an array
/// afterwards. `#[repr(C)]` and free of pointers, so it can be handed to
/// Unreal through `unr` or to a server as bytes without translation.
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct Skeleton {
    bones: [u16; Bone::COUNT],
}

impl Default for Skeleton {
    fn default() -> Self {
        Self::new()
    }
}

impl Skeleton {
    /// An empty table, with every role unmapped.
    pub const fn new() -> Self {
        Self {
            bones: [UNMAPPED; Bone::COUNT],
        }
    }

    /// Records which bone of this skeleton fills `role`.
    pub const fn set(&mut self, role: Bone, bone: u16) {
        self.bones[role.index()] = bone;
    }

    /// The bone filling `role`, if any.
    #[inline]
    pub const fn get(&self, role: Bone) -> Option<u16> {
        match self.bones[role.index()] {
            UNMAPPED => None,
            bone => Some(bone),
        }
    }

    /// Fills the table from a skeleton's bone names.
    ///
    /// The only place a string is ever looked at. Call it once, at load, with
    /// whatever the engine calls its bones -- glTF node names, a UE bone array,
    /// an FBX import -- and the runtime never sees a name again.
    pub fn learn<'a>(&mut self, names: impl IntoIterator<Item = (u16, &'a str)>) -> usize {
        let mut found = 0;
        for (bone, name) in names {
            if let Some(role) = role_of(name) {
                self.set(role, bone);
                found += 1;
            }
        }
        found
    }

    /// The bones of a three-joint chain, or `None` if any is missing.
    ///
    /// Missing rather than partial: solving a limb with a guessed elbow is
    /// worse than not solving it.
    pub const fn chain(&self, roles: [Bone; 3]) -> Option<[u16; 3]> {
        match (self.get(roles[0]), self.get(roles[1]), self.get(roles[2])) {
            (Some(a), Some(b), Some(c)) => Some([a, b, c]),
            _ => None,
        }
    }

    /// The topmost spine segment present -- the chest, whatever a rig numbers
    /// it.
    ///
    /// The reason spines are indexed rather than named: this answers the same
    /// question on a three-bone spine and a five-bone one.
    pub fn chest(&self) -> Option<u16> {
        (0..MAX_SPINE)
            .rev()
            .find_map(|i| self.get(Bone::Spine(i as u8)))
    }
}

/// The three bones of a limb, root to tip, for the side given.
///
/// The chain the hinge solver wants, named by role so a caller can look each
/// one up in whatever skeleton it holds.
pub const fn arm(side: Side) -> [Bone; 3] {
    [Bone::UpperArm(side), Bone::LowerArm(side), Bone::Hand(side)]
}

/// The three bones of a leg, hip to ankle.
pub const fn leg(side: Side) -> [Bone; 3] {
    [Bone::Thigh(side), Bone::Calf(side), Bone::Foot(side)]
}
