package com.kbve.statetree.ship;

import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.minecraft.item.Item;
import net.minecraft.item.ItemGroup;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.util.Identifier;

import java.util.HashMap;
import java.util.Map;

public final class ShipItems {

    /** modelName → registered Item — used by ShipEntity.pickupAsItem. */
    private static final Map<String, Item> BY_MODEL = new HashMap<>();

    public static final Item AIRSHIP = register("airship", "immersive_aircraft/airship");
    public static final Item BIPLANE = register("biplane", "immersive_aircraft/biplane");
    public static final Item GYRODYNE = register("gyrodyne", "immersive_aircraft/gyrodyne");

    /** Lookup the item form for a ship model — null if unregistered. */
    public static Item forModel(String modelName) {
        return modelName == null ? null : BY_MODEL.get(modelName);
    }

    private static final RegistryKey<ItemGroup> TOOLS_GROUP =
            RegistryKey.of(RegistryKeys.ITEM_GROUP, Identifier.ofVanilla("tools"));

    private static Item register(String name, String modelName) {
        Identifier id = Identifier.of("behavior_statetree", name);
        RegistryKey<Item> key = RegistryKey.of(RegistryKeys.ITEM, id);
        Item item = Registry.register(Registries.ITEM, id,
                new ShipItem(new Item.Settings().registryKey(key).maxCount(1), modelName));
        BY_MODEL.put(modelName, item);
        return item;
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
