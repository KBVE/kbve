use godot::prelude::*;
use papaya::HashMap;
use std::marker::PhantomData;

pub struct ResourceCache<T: GodotClass> {
  map: HashMap<String, Gd<T>>,
  _marker: PhantomData<T>,
}

impl<T: GodotClass> ResourceCache<T> {
  pub fn new() -> Self {
    Self {
      map: HashMap::new(),
      _marker: PhantomData,
    }
  }

  pub fn insert(&self, key: &str, object: Gd<T>) {
    let guard = self.map.guard();
    self.map.insert(key.to_string(), object, &guard);
  }

  pub fn get(&self, key: &str) -> Option<Gd<T>> {
    let guard = self.map.guard();
    self.map.get(key, &guard).cloned()
  }

  pub fn contains(&self, key: &str) -> bool {
    let guard = self.map.guard();
    self.map.contains_key(key, &guard)
  }

  pub fn insert_upcast<U>(&self, key: &str, object: Gd<U>) where U: Inherits<T> + GodotClass {
    self.insert(key, object.upcast::<T>());
  }

  pub fn get_as<U>(&self, key: &str) -> Option<Gd<U>> where U: Inherits<T> + GodotClass {
    self.get(key)?.try_cast::<U>().ok()
  }
}
