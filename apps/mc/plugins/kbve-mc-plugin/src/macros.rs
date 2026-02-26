// ---------------------------------------------------------------------------
// ins_item! — insert a single ItemDef into a DashMap with optional fields
// ---------------------------------------------------------------------------

macro_rules! ins_item {
    ($map:expr, $key:literal, {
        base: $base:literal,
        model: $model:literal,
        name: $name:literal,
        color: $color:expr
        $(, particle: ($particle:expr, $count:expr))?
        $(, max_damage: $max_damage:expr)?
        $(, potion: { color: $potion_color:expr, effects: $effects:expr })?
        $(,)?
    }) => {{
        $map.insert(
            $key,
            $crate::ItemDef {
                base_item_key: $base,
                model: $model,
                display_name: $name,
                message_color: $color,
                particle: ins_item!(@opt_particle $(($particle, $count))?),
                max_damage: ins_item!(@opt_val $($max_damage)?),
                potion: ins_item!(@opt_potion $(($potion_color, $effects))?),
            },
        );
    }};

    // Internal helpers for optional fields
    (@opt_particle ($particle:expr, $count:expr)) => { Some(($particle, $count)) };
    (@opt_particle) => { None };

    (@opt_val $v:expr) => { Some($v) };
    (@opt_val) => { None };

    (@opt_potion ($color:expr, $effects:expr)) => {
        Some($crate::PotionEffects { custom_color: $color, effects: $effects })
    };
    (@opt_potion) => { None };
}

// ---------------------------------------------------------------------------
// item_registry! — define all items in a single compact block
// ---------------------------------------------------------------------------

macro_rules! item_registry {
    ($map:expr; $(
        $key:literal => {
            base: $base:literal,
            model: $model:literal,
            name: $name:literal,
            color: $color:expr
            $(, particle: ($particle:expr, $count:expr))?
            $(, max_damage: $max_damage:expr)?
            $(, potion: { color: $potion_color:expr, effects: $effects:expr })?
            $(,)?
        }
    ),* $(,)?) => {{
        $(
            ins_item!($map, $key, {
                base: $base,
                model: $model,
                name: $name,
                color: $color
                $(, particle: ($particle, $count))?
                $(, max_damage: $max_damage)?
                $(, potion: { color: $potion_color, effects: $effects })?
            });
        )*
    }};
}
