use rustc_hash::FxHasher;
use std::hash::{ Hash, Hasher };

pub fn hash_key<T: Hash>(value: &T) -> u64 {
  let mut hasher = FxHasher::default();
  value.hash(&mut hasher);
  hasher.finish()
}
