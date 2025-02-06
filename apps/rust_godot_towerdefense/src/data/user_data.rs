use godot::prelude::*;
use papaya::HashMap;
use std::marker::PhantomData;

pub struct UserDataCache {
  map: HashMap<String, Variant>,
  _marker: PhantomData<()>,
}

impl UserDataCache {
  pub fn new() -> Self {
    Self {
      map: HashMap::new(),
      _marker: PhantomData,
    }
  }

  pub fn insert<T: ToGodot>(&self, key: &str, value: T) {
    let guard = self.map.guard();
    self.map.insert(key.to_string(), value.to_variant(), &guard);
  }

  pub fn get<T: FromGodot>(&self, key: &str) -> Option<T> {
    let guard = self.map.guard();
    self.map.get(key, &guard).and_then(|variant| Some(T::from_variant(variant)))
  }

  pub fn contains(&self, key: &str) -> bool {
    let guard = self.map.guard();
    self.map.contains_key(key, &guard)
  }

  pub fn remove(&self, key: &str) -> Option<Variant> {
    let guard = self.map.guard();
    self.map.remove(key, &guard).cloned()
  }

  pub fn update<T: ToGodot>(&self, key: &str, value: T) -> bool {
    if self.contains(key) {
      self.insert(key, value);
      true
    } else {
      false
    }
  }
}
