package com.kbve.statetree.ship;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.UUID;

/**
 * Server commands for the ship system.
 *
 * <p>Commands (all require op level 2):
 * <ul>
 *   <li>{@code /spawnship <name>} — spawn a ship from a bundled schematic
 *       at a safe ocean location near the player</li>
 *   <li>{@code /removeship <uuid>} — remove a ship by its UUID</li>
 * </ul>
 */
public final class ShipCommands {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Available ship schematics bundled in the JAR. */
    private static final Map<String, String> SCHEMATICS = Map.of(
            "dark_reaper", "/schematics/dark_reaper.nbt"
    );

    private ShipCommands() {}

    public static void register(CommandDispatcher<ServerCommandSource> dispatcher, ShipManager manager) {
        dispatcher.register(
                CommandManager.literal("spawnship")
                        .requires(source -> source.hasPermission(2))
                        .then(CommandManager.argument("name", StringArgumentType.word())
                                .suggests((ctx, builder) -> {
                                    SCHEMATICS.keySet().forEach(builder::suggest);
                                    return builder.buildFuture();
                                })
                                .executes(ctx -> {
                                    String name = StringArgumentType.getString(ctx, "name");
                                    return executeSpawn(ctx.getSource(), manager, name);
                                })
                        )
        );

        dispatcher.register(
                CommandManager.literal("removeship")
                        .requires(source -> source.hasPermission(2))
                        .then(CommandManager.argument("uuid", StringArgumentType.string())
                                .executes(ctx -> {
                                    String uuidStr = StringArgumentType.getString(ctx, "uuid");
                                    return executeRemove(ctx.getSource(), manager, uuidStr);
                                })
                        )
        );
    }

    private static int executeSpawn(ServerCommandSource source, ShipManager manager, String name) {
        String resource = SCHEMATICS.get(name);
        if (resource == null) {
            source.sendError(Text.of("Unknown ship: " + name + ". Available: " + SCHEMATICS.keySet()));
            return 0;
        }

        ServerPlayerEntity player = source.getPlayer();
        if (player == null) {
            source.sendError(Text.of("This command must be run by a player"));
            return 0;
        }

        ServerWorld world = source.getWorld();

        source.sendFeedback(() -> Text.of("\u00A7eLoading schematic '" + name + "'..."), false);

        ShipData data = SchematicLoader.loadFromResource(name, resource);
        if (data == null) {
            source.sendError(Text.of("Failed to load schematic: " + name));
            return 0;
        }

        source.sendFeedback(() -> Text.of(
                "\u00A7eLoaded " + data.blockCount() + " blocks (" +
                        data.sizeX() + "x" + data.sizeY() + "x" + data.sizeZ() +
                        "). Searching for safe ocean..."), false);

        BlockPos searchFrom = player.getBlockPos();
        UUID shipId = manager.placeShip(world, data, player.getUuid(), searchFrom);

        if (shipId == null) {
            source.sendError(Text.of("Could not find a safe ocean location within search radius"));
            return 0;
        }

        ShipManager.ActiveShip ship = manager.getShip(shipId);
        source.sendFeedback(() -> Text.of(
                "\u00A7a\u00A7lShip placed! \u00A7r\u00A7e'" + name +
                        "' at " + ship.anchor.toShortString() +
                        " (id: " + shipId + ")"), true);

        return 1;
    }

    private static int executeRemove(ServerCommandSource source, ShipManager manager, String uuidStr) {
        UUID shipId;
        try {
            shipId = UUID.fromString(uuidStr);
        } catch (IllegalArgumentException e) {
            source.sendError(Text.of("Invalid UUID: " + uuidStr));
            return 0;
        }

        ServerWorld world = source.getWorld();
        if (manager.removeShip(world, shipId)) {
            source.sendFeedback(() -> Text.of("\u00A7aShip removed: " + shipId), true);
            return 1;
        } else {
            source.sendError(Text.of("No active ship with id: " + shipId));
            return 0;
        }
    }
}
