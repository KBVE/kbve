package com.kbve.statetree.ship;

import net.fabricmc.fabric.api.object.builder.v1.entity.FabricEntityTypeBuilder;
import net.minecraft.entity.EntityDimensions;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnGroup;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.util.Identifier;

/**
 * Registers custom entity types for the ship system.
 */
public final class ShipEntityTypes {

    public static final EntityType<ShipEntity> SHIP = Registry.register(
            Registries.ENTITY_TYPE,
            Identifier.of("behavior_statetree", "ship"),
            EntityType.Builder.<ShipEntity>create(ShipEntity::new, SpawnGroup.MISC)
                    .dimensions(1.0f, 1.0f)
                    .maxTrackingRange(128)
                    .trackingTickInterval(1)
                    .build()
    );

    /** Call from mod init to force static initialization. */
    public static void register() {
        // Static init handles registration
    }

    private ShipEntityTypes() {}
}
