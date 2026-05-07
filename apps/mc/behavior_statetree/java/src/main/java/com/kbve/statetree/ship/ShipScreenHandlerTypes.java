package com.kbve.statetree.ship;

import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.resource.featuretoggle.FeatureSet;
import net.minecraft.screen.ScreenHandlerType;
import net.minecraft.util.Identifier;

/** Registry holder for ship-related ScreenHandlerType instances. */
public final class ShipScreenHandlerTypes {

    public static final Identifier SHIP_ID = Identifier.of("behavior_statetree", "ship");

    public static final ScreenHandlerType<ShipScreenHandler> SHIP = Registry.register(
            Registries.SCREEN_HANDLER,
            SHIP_ID,
            new ScreenHandlerType<>(
                    (syncId, playerInv) -> new ShipScreenHandler(syncId, playerInv),
                    FeatureSet.empty())
    );

    private ShipScreenHandlerTypes() {}

    public static void register() {
        // Static init handles registration.
    }
}
