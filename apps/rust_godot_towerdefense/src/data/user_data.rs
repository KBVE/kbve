use godot::prelude::*;
use papaya::HashMap;
use serde::{ Serialize, Deserialize };
use std::marker::PhantomData;
use crate::data::abstract_data_map::AbstractDataMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserData {
  pub username: String,
  pub email: String,
  pub opacity: f32,
  pub fullscreen: bool,
  pub theme: Option<String>,
}

impl AbstractDataMap for UserData {}

impl UserData {
  pub fn new(username: &str, email: &str, opacity: f32, fullscreen: bool, theme: Option<String>) -> Self {
    Self {
      username: username.to_string(),
      email: email.to_string(),
      opacity,
      fullscreen,
      theme,
    }
  }
}

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
    self.map.get(key, &guard).map(|variant| T::from_variant(variant))
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

  pub fn save_user_data(&self, user_data: &UserData) {
    let data_map = user_data.to_variant_map();
    let guard = self.map.guard();
    for (key, value) in data_map.iter(&guard) {
      self.map.insert(key.clone(), value.clone(), &guard);
    }
  }

  pub fn load_user_data(&self) -> Option<UserData> {
    let guard = self.map.guard();
    let data_map: HashMap<String, Variant> = self.map
      .iter(&guard)
      .map(|(k, v)| (k.clone(), v.clone()))
      .collect();

    UserData::from_variant_map(&data_map)
  }
}
