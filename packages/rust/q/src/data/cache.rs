use crate::data::shader_data::ShaderCache;
use dashmap::DashMap;
use godot::classes::{AudioStream, CanvasLayer, Control, Texture2D};
use godot::prelude::*;
use std::sync::Arc;

pub struct ResourceCache<T: GodotClass> {
    map: DashMap<String, Gd<T>>,
}

impl<T: GodotClass> ResourceCache<T> {
    pub fn new() -> Self {
        Self {
            map: DashMap::new(),
        }
    }

    pub fn insert(&self, key: &str, object: Gd<T>) {
        self.map.insert(key.to_string(), object);
    }

    pub fn get(&self, key: &str) -> Option<Gd<T>> {
        self.map.get(&key.to_string()).map(|r| r.value().clone())
    }

    pub fn get_arc(&self, key: &str) -> Option<Arc<Gd<T>>> {
        self.map
            .get(&key.to_string())
            .map(|r| Arc::new(r.value().clone()))
    }

    pub fn contains(&self, key: &str) -> bool {
        self.map.contains_key(&key.to_string())
    }

    pub fn insert_upcast<U>(&self, key: &str, object: Gd<U>)
    where
        U: Inherits<T> + GodotClass,
    {
        self.insert(key, object.upcast::<T>());
    }

    pub fn get_as<U>(&self, key: &str) -> Option<Gd<U>>
    where
        U: Inherits<T> + GodotClass,
    {
        self.get(key)?.try_cast::<U>().ok()
    }

    pub fn remove(&self, key: &str) -> Option<Gd<T>> {
        self.map.remove(&key.to_string()).map(|(_, v)| v)
    }
}

#[derive(GodotClass)]
#[class(base = Node)]
pub struct CacheManager {
    base: Base<Node>,
    texture_cache: ResourceCache<Texture2D>,
    canvas_layer_cache: ResourceCache<CanvasLayer>,
    ui_cache: ResourceCache<Control>,
    audio_cache: ResourceCache<AudioStream>,
    shader_cache: Gd<ShaderCache>,
}

#[godot_api]
impl INode for CacheManager {
    fn init(base: Base<Self::Base>) -> Self {
        let shader_cache = Gd::from_init_fn(|base| ShaderCache::init(base));

        Self {
            base,
            texture_cache: ResourceCache::new(),
            canvas_layer_cache: ResourceCache::new(),
            ui_cache: ResourceCache::new(),
            audio_cache: ResourceCache::new(),
            shader_cache,
        }
    }

    fn ready(&mut self) {
        let shader_cache = self.shader_cache.clone();

        {
            let mut base = self.base_mut();
            base.add_child(&shader_cache.upcast::<Node>());
        }
    }
}

#[godot_api]
impl CacheManager {
    fn internal_canvas_layer_cache(&self) -> &ResourceCache<CanvasLayer> {
        &self.canvas_layer_cache
    }

    fn internal_ui_cache(&self) -> &ResourceCache<Control> {
        &self.ui_cache
    }

    fn internal_texture_cache(&self) -> &ResourceCache<Texture2D> {
        &self.texture_cache
    }

    pub fn internal_audio_cache(&self) -> &ResourceCache<AudioStream> {
        &self.audio_cache
    }

    fn internal_shader_cache(&self) -> &Gd<ShaderCache> {
        &self.shader_cache
    }

    fn internal_shader_cache_as_node(&self) -> Gd<Node> {
        self.shader_cache.clone().upcast::<Node>()
    }

    pub fn insert_texture(&self, key: &str, texture: Gd<Texture2D>) {
        self.texture_cache.insert(key, texture);
    }

    #[func]
    fn get_from_canvas_layer_cache(&self, key: GString) -> Option<Gd<CanvasLayer>> {
        self.canvas_layer_cache.get(key.to_string().as_str())
    }

    #[func]
    fn get_from_ui_cache(&self, key: GString) -> Option<Gd<Control>> {
        self.ui_cache.get(key.to_string().as_str())
    }

    #[func]
    pub fn get_from_texture_cache(&self, key: GString) -> Option<Gd<Texture2D>> {
        self.texture_cache.get(key.to_string().as_str())
    }

    #[func]
    pub fn insert_into_texture_cache(&self, key: GString, texture: Gd<Texture2D>) {
        self.texture_cache.insert(key.to_string().as_str(), texture);
    }

    #[func]
    pub fn get_from_audio_cache(&self, key: GString) -> Option<Gd<AudioStream>> {
        self.audio_cache.get(key.to_string().as_str())
    }

    #[func]
    pub fn obtain_shader_cache(&self) -> Gd<ShaderCache> {
        self.shader_cache.clone()
    }
}
