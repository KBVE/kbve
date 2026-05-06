package com.kbve.statetree.ship;

import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.minecraft.item.Item;
import net.minecraft.item.ItemGroup;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.util.Identifier;

public final class ShipItems {

    public static final Item AIRSHIP = register("airship", "immersive_aircraft/airship");
    public static final Item BIPLANE = register("biplane", "immersive_aircraft/biplane");
    public static final Item GYRODYNE = register("gyrodyne", "immersive_aircraft/gyrodyne");

    private static final RegistryKey<ItemGroup> TOOLS_GROUP =
            RegistryKey.of(RegistryKeys.ITEM_GROUP, Identifier.ofVanilla("tools"));

    private static Item register(String name, String modelName) {
        Identifier id = Identifier.of("behavior_statetree", name);
        RegistryKey<Item> key = RegistryKey.of(RegistryKeys.ITEM, id);
        return Registry.register(Registries.ITEM, id,
                new ShipItem(new Item.Settings().registryKey(key).maxCount(1), modelName));
    }

    public static void register() {
        ItemGroupEvents.modifyEntriesEvent(TOOLS_GROUP).register(content -> {
            content.add(AIRSHIP);
            content.add(BIPLANE);
            content.add(GYRODYNE);
        });
    }

    private ShipItems() {}
}
