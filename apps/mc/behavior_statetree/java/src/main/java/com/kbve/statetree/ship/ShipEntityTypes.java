package com.kbve.statetree.ship;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnGroup;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.util.Identifier;

/**
 * Registers custom entity types for the ship system.
 */
public final class ShipEntityTypes {

    private static final Identifier SHIP_ID = Identifier.of("behavior_statetree", "ship");

    public static final EntityType<ShipEntity> SHIP = Registry.register(
            Registries.ENTITY_TYPE,
            SHIP_ID,
            EntityType.Builder.<ShipEntity>create(ShipEntity::new, SpawnGroup.MISC)
                    .dimensions(1.0f, 1.0f)
                    .maxTrackingRange(128)
                    .trackingTickInterval(1)
                    .build(RegistryKey.of(RegistryKeys.ENTITY_TYPE, SHIP_ID))
    );

    /** Call from mod init to force static initialization. */
    public static void register() {
        // Static init handles registration
    }

    private ShipEntityTypes() {}
}
