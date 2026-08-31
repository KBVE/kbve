//! Per-instance pet variance: stat rolls and a nature.
//!
//! Until now two pets of the same species and level were byte-identical —
//! [`crate::pets::level_scale`] is a pure function of base stat and level, so catching a
//! second mechamutt got you nothing. This module is what makes an individual pet an
//! individual, and it is the reason `pet_instances` needs per-row columns at all.
//!
//! Both halves are deliberately cheap to persist: six bytes of IVs and one nature byte.
//!
//! # Why the defaults are the old behaviour
//!
//! All-zero IVs with nature 0 make [`PetGenes::apply`] the identity function, so a pet
//! carrying [`PetGenes::default`] has exactly the stats it would have had before this
//! module existed. Nothing already alive changes number silently.

use bevy::prelude::Component;
use serde::{Deserialize, Serialize};

/// The six stats an individual pet varies in. Distinct from [`crate::battle::StatId`],
/// which is the *battle* stat set — that one carries accuracy and evasion (no meaningful
/// base value to roll against) and omits hp (no in-battle stage).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum GeneStat {
    Hp = 0,
    Attack = 1,
    Defense = 2,
    SpAttack = 3,
    SpDefense = 4,
    Speed = 5,
}

impl GeneStat {
    pub const ALL: [GeneStat; 6] = [
        GeneStat::Hp,
        GeneStat::Attack,
        GeneStat::Defense,
        GeneStat::SpAttack,
        GeneStat::SpDefense,
        GeneStat::Speed,
    ];

    /// Short label for a notice or the hub, matching the roster UI's column headers.
    pub fn label(self) -> &'static str {
        match self {
            GeneStat::Hp => "HP",
            GeneStat::Attack => "Atk",
            GeneStat::Defense => "Def",
            GeneStat::SpAttack => "SpA",
            GeneStat::SpDefense => "SpD",
            GeneStat::Speed => "Spe",
        }
    }
}

/// Highest individual value a roll can produce.
pub const IV_MAX: u8 = 31;

/// IVs are applied as a fraction of the level-scaled stat rather than added to the base,
/// so a 31 is worth the same *proportion* on a 7-defense species as on a 45-hp one. At
/// this denominator a perfect roll is +12%, which is in the same range as a nature.
const IV_DENOM: i64 = 256;

/// Nature adjustment, as an exact integer ratio so server and client never disagree by a
/// rounding step. ±10%.
const BOOST: (i64, i64) = (11, 10);
const DROP: (i64, i64) = (9, 10);
const EVEN: (i64, i64) = (1, 1);

/// The five stats a nature can shift, in nature-index order. Hp is absent on purpose: a
/// nature that moved max-hp would interact with the proportional hp carry in
/// [`crate::progress::carry_hp`] every time a pet levelled or evolved.
const NATURE_STATS: [GeneStat; 5] = [
    GeneStat::Attack,
    GeneStat::Defense,
    GeneStat::SpAttack,
    GeneStat::SpDefense,
    GeneStat::Speed,
];

/// A pet's temperament: one stat raised 10%, another lowered 10%.
///
/// Encoded as a single byte `boosted * 5 + lowered` over [`NATURE_STATS`]. The five
/// diagonal values raise and lower the same stat, which cancels — those are the neutral
/// natures, and index 0 being one of them is what makes [`PetGenes::default`] inert.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Nature(u8);

impl Nature {
    /// How many distinct natures exist. 25 = 5 boosted × 5 lowered, of which 5 are neutral.
    pub const COUNT: u8 = 25;

    /// Wrap an arbitrary byte into range, so a corrupt or future-authored value degrades to
    /// a real nature instead of panicking.
    pub fn from_index(index: u8) -> Nature {
        Nature(index % Nature::COUNT)
    }

    pub fn index(self) -> u8 {
        self.0
    }

    /// The stat this nature raises, or `None` when it is neutral.
    pub fn boosted(self) -> Option<GeneStat> {
        (!self.is_neutral()).then(|| NATURE_STATS[(self.0 / 5) as usize])
    }

    /// The stat this nature lowers, or `None` when it is neutral.
    pub fn lowered(self) -> Option<GeneStat> {
        (!self.is_neutral()).then(|| NATURE_STATS[(self.0 % 5) as usize])
    }

    pub fn is_neutral(self) -> bool {
        self.0 / 5 == self.0 % 5
    }

    fn factor(self, stat: GeneStat) -> (i64, i64) {
        if self.boosted() == Some(stat) {
            BOOST
        } else if self.lowered() == Some(stat) {
            DROP
        } else {
            EVEN
        }
    }
}

/// A pet's fixed genetics — rolled once at mint and never changed, not by levelling and
/// not by evolution. Six IVs plus a nature byte.
#[derive(Component, Clone, Copy, Debug, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub struct PetGenes {
    /// Indexed by [`GeneStat`], each `0..=IV_MAX`.
    pub ivs: [u8; 6],
    pub nature: Nature,
}

impl PetGenes {
    /// Derive genetics from a pet's ULID.
    ///
    /// Deriving rather than drawing from a live RNG keeps [`crate::mint_pet_from_species`]
    /// free of an rng parameter and makes every test reproducible from an id alone. The
    /// values are still stored rather than recomputed on load, because otherwise this
    /// function could never be changed without silently restatting every pet in the
    /// database.
    pub fn roll(pet_id: &str) -> PetGenes {
        let mut words = vec![crate::rng::domain::PETGENE];
        for chunk in pet_id.as_bytes().chunks(4) {
            let mut w = [0u8; 4];
            w[..chunk.len()].copy_from_slice(chunk);
            words.push(u32::from_le_bytes(w));
        }
        let seed = crate::rng::mix32(&words);
        let mut rng = crate::rng::Mulberry32::new(seed);
        let mut ivs = [0u8; 6];
        for iv in ivs.iter_mut() {
            *iv = rng.range(0, IV_MAX as i32) as u8;
        }
        PetGenes {
            ivs,
            nature: Nature::from_index(rng.range(0, Nature::COUNT as i32 - 1) as u8),
        }
    }

    pub fn iv(&self, stat: GeneStat) -> u8 {
        self.ivs[stat as usize].min(IV_MAX)
    }

    /// Total of all six rolls, `0..=186` — the one number worth showing a player who does
    /// not want to read six of them.
    pub fn iv_total(&self) -> u32 {
        GeneStat::ALL.iter().map(|&s| self.iv(s) as u32).sum()
    }

    /// Apply this pet's IV and nature to an already level-scaled stat.
    ///
    /// IV first, then nature, and never below 1 — a 0.9 nature on a 1-point stat must still
    /// leave a usable number. Order is fixed and integer throughout so a pet minted at level
    /// N, grown to level N, and evolved into level N all land on the same value.
    pub fn apply(&self, stat: GeneStat, scaled: i32) -> i32 {
        if scaled <= 0 {
            return scaled;
        }
        let with_iv = scaled as i64 * (IV_DENOM + self.iv(stat) as i64) / IV_DENOM;
        let (num, den) = self.nature.factor(stat);
        (with_iv * num / den).clamp(1, i32::MAX as i64) as i32
    }
}

/// A pet's gender, rolled at mint from the species' `gender_ratio`.
///
/// Cosmetic today — breeding is out of scope for the pet epic. It exists because it is one
/// byte now versus backfilling every live row later.
#[derive(Component, Clone, Copy, Debug, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub enum PetGender {
    #[default]
    Genderless = 0,
    Male = 1,
    Female = 2,
}

impl PetGender {
    pub fn from_wire(byte: u8) -> PetGender {
        match byte {
            1 => PetGender::Male,
            2 => PetGender::Female,
            _ => PetGender::Genderless,
        }
    }

    pub fn as_wire(self) -> u8 {
        self as u8
    }

    pub fn glyph(self) -> &'static str {
        match self {
            PetGender::Male => "♂",
            PetGender::Female => "♀",
            PetGender::Genderless => "",
        }
    }

    /// Roll from a species `gender_ratio` — the male fraction.
    ///
    /// `None` means the species never authored one and `< 0.0` is the proto's explicit
    /// genderless marker; both land on [`PetGender::Genderless`] so an unauthored species
    /// does not silently become all-male.
    pub fn roll(ratio: Option<f32>, pet_id: &str) -> PetGender {
        let Some(ratio) = ratio.filter(|r| *r >= 0.0) else {
            return PetGender::Genderless;
        };
        let mut words = vec![crate::rng::domain::PETSEX];
        for chunk in pet_id.as_bytes().chunks(4) {
            let mut w = [0u8; 4];
            w[..chunk.len()].copy_from_slice(chunk);
            words.push(u32::from_le_bytes(w));
        }
        let roll = crate::rng::mix32(&words) % 1000;
        if roll < (ratio.clamp(0.0, 1.0) * 1000.0) as u32 {
            PetGender::Male
        } else {
            PetGender::Female
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_genes_change_nothing() {
        let genes = PetGenes::default();
        assert!(genes.nature.is_neutral());
        for stat in GeneStat::ALL {
            assert_eq!(genes.iv(stat), 0);
            for scaled in [1, 7, 45, 300, 9999] {
                assert_eq!(
                    genes.apply(stat, scaled),
                    scaled,
                    "default genes must be the identity so nothing already alive restats"
                );
            }
        }
    }

    #[test]
    fn every_nature_index_is_a_real_nature() {
        let mut neutral = 0;
        for i in 0..Nature::COUNT {
            let n = Nature::from_index(i);
            assert_eq!(n.index(), i);
            match (n.boosted(), n.lowered()) {
                (None, None) => neutral += 1,
                (Some(up), Some(down)) => assert_ne!(up, down),
                other => panic!("nature {i} is half-neutral: {other:?}"),
            }
        }
        assert_eq!(neutral, 5, "one neutral per stat");
    }

    #[test]
    fn an_out_of_range_nature_byte_wraps_rather_than_panics() {
        assert_eq!(Nature::from_index(25).index(), 0);
        assert_eq!(Nature::from_index(255).index(), 255 % 25);
    }

    #[test]
    fn a_nature_raises_one_stat_and_lowers_another() {
        // boosted = Attack (0), lowered = Speed (4)
        let genes = PetGenes {
            ivs: [0; 6],
            nature: Nature::from_index(4),
        };
        assert_eq!(genes.nature.boosted(), Some(GeneStat::Attack));
        assert_eq!(genes.nature.lowered(), Some(GeneStat::Speed));
        assert_eq!(genes.apply(GeneStat::Attack, 100), 110);
        assert_eq!(genes.apply(GeneStat::Speed, 100), 90);
        assert_eq!(genes.apply(GeneStat::Defense, 100), 100);
        assert_eq!(
            genes.apply(GeneStat::Hp, 100),
            100,
            "no nature touches hp — it would fight the proportional hp carry"
        );
    }

    #[test]
    fn a_perfect_iv_is_worth_about_a_nature() {
        let genes = PetGenes {
            ivs: [IV_MAX; 6],
            nature: Nature::default(),
        };
        assert_eq!(genes.apply(GeneStat::Attack, 100), 112);
        assert_eq!(genes.iv_total(), 31 * 6);
    }

    #[test]
    fn a_lowering_nature_never_zeroes_a_tiny_stat() {
        let genes = PetGenes {
            ivs: [0; 6],
            nature: Nature::from_index(1), // boost Attack, lower Defense
        };
        assert_eq!(genes.apply(GeneStat::Defense, 1), 1);
    }

    #[test]
    fn rolls_are_derived_from_the_id_and_stay_in_range() {
        let a = PetGenes::roll("01KME8R5PG7Z9QB3T6VX2H4N01");
        assert_eq!(a, PetGenes::roll("01KME8R5PG7Z9QB3T6VX2H4N01"));
        assert_ne!(a, PetGenes::roll("01KME8R5PG7Z9QB3T6VX2H4N02"));
        for stat in GeneStat::ALL {
            assert!(a.iv(stat) <= IV_MAX);
        }
        assert!(a.nature.index() < Nature::COUNT);
    }

    #[test]
    fn rolls_spread_across_the_range() {
        // Not a distribution proof — a guard that the derivation is not collapsing every
        // pet onto one gene set, which is the failure mode that would quietly undo this
        // whole module.
        let ids: Vec<String> = (0..200)
            .map(|i| format!("01KME8R5PG7Z9QB3T6VX2H4N{i:02}"))
            .collect();
        let rolled: Vec<PetGenes> = ids.iter().map(|id| PetGenes::roll(id)).collect();
        let distinct: std::collections::HashSet<_> = rolled.iter().collect();
        assert!(
            distinct.len() > 190,
            "only {} distinct gene sets",
            distinct.len()
        );
        let natures: std::collections::HashSet<u8> =
            rolled.iter().map(|g| g.nature.index()).collect();
        assert!(
            natures.len() > 15,
            "only {} distinct natures",
            natures.len()
        );
    }

    #[test]
    fn an_unauthored_gender_ratio_is_genderless_not_male() {
        assert_eq!(PetGender::roll(None, "abc"), PetGender::Genderless);
        assert_eq!(PetGender::roll(Some(-1.0), "abc"), PetGender::Genderless);
    }

    #[test]
    fn a_fixed_gender_ratio_is_absolute() {
        for i in 0..40 {
            let id = format!("01KME8R5PG7Z9QB3T6VX2H4N{i:02}");
            assert_eq!(PetGender::roll(Some(1.0), &id), PetGender::Male);
            assert_eq!(PetGender::roll(Some(0.0), &id), PetGender::Female);
        }
    }

    #[test]
    fn an_even_gender_ratio_produces_both() {
        let mut male = 0;
        let mut female = 0;
        for i in 0..100 {
            let id = format!("01KME8R5PG7Z9QB3T6VX2H4N{i:02}");
            match PetGender::roll(Some(0.5), &id) {
                PetGender::Male => male += 1,
                PetGender::Female => female += 1,
                PetGender::Genderless => panic!("authored ratio must not be genderless"),
            }
        }
        assert!(male > 25 && female > 25, "{male} male / {female} female");
    }

    #[test]
    fn gender_survives_a_wire_round_trip() {
        for gender in [PetGender::Genderless, PetGender::Male, PetGender::Female] {
            assert_eq!(PetGender::from_wire(gender.as_wire()), gender);
        }
        assert_eq!(PetGender::from_wire(200), PetGender::Genderless);
    }
}
