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

import java.util.UUID;

/**
 * Server commands for the ship system.
 *
 * <ul>
 *   <li>{@code /spawnship <name>} — deploy a ship from the Shipyard pool</li>
 *   <li>{@code /removeship <uuid>} — remove a ship by its UUID</li>
 *   <li>{@code /shipyard} — show Shipyard inventory status</li>
 * </ul>
 */
public final class ShipCommands {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    private ShipCommands() {}

    public static void register(
            CommandDispatcher<ServerCommandSource> dispatcher,
            ShipManager manager,
            Shipyard shipyard) {

        dispatcher.register(
                CommandManager.literal("spawnship")
                        .requires(ServerCommandSource::isExecutedByPlayer)
                        .then(CommandManager.argument("name", StringArgumentType.word())
                                .suggests((ctx, builder) -> {
                                    shipyard.blueprintNames().forEach(builder::suggest);
                                    return builder.buildFuture();
                                })
                                .executes(ctx -> {
                                    String name = StringArgumentType.getString(ctx, "name");
                                    return executeSpawn(ctx.getSource(), manager, shipyard, name);
                                })
                        )
        );

        dispatcher.register(
                CommandManager.literal("removeship")
                        .requires(ServerCommandSource::isExecutedByPlayer)
                        .then(CommandManager.argument("uuid", StringArgumentType.string())
                                .executes(ctx -> {
                                    String uuidStr = StringArgumentType.getString(ctx, "uuid");
                                    return executeRemove(ctx.getSource(), manager, uuidStr);
                                })
                        )
        );

        dispatcher.register(
                CommandManager.literal("shipyard")
                        .requires(ServerCommandSource::isExecutedByPlayer)
                        .executes(ctx -> executeStatus(ctx.getSource(), shipyard, manager))
        );
    }

    private static int executeSpawn(
            ServerCommandSource source,
            ShipManager manager,
            Shipyard shipyard,
            String name) {

        ServerPlayerEntity player = source.getPlayer();
        if (player == null) {
            source.sendError(Text.of("This command must be run by a player"));
            return 0;
        }

        // Acquire from Shipyard — instant if cached, triggers background load if not
        if (!shipyard.blueprintNames().contains(name)) {
            source.sendError(Text.of("Unknown ship: " + name + ". Available: " + shipyard.blueprintNames()));
            return 0;
        }

        ShipData data = shipyard.acquire(name);
        if (data == null) {
            if (shipyard.isLoading(name)) {
                source.sendFeedback(() -> Text.of(
                        "\u00A7eShip '" + name + "' is being loaded in the background. Try again in a few seconds."), false);
            } else {
                source.sendFeedback(() -> Text.of(
                        "\u00A7eLoading ship '" + name + "' for the first time. Try again in a few seconds."), false);
            }
            return 0;
        }

        source.sendFeedback(() -> Text.of(
                "\u00A7eDeploying '" + name + "' (" + data.blockCount() +
                        " blocks). Searching for safe ocean..."), false);

        ServerWorld world = source.getWorld();
        BlockPos searchFrom = player.getBlockPos();
        UUID shipId = manager.placeShip(world, data, player.getUuid(), searchFrom);

        if (shipId == null) {
            source.sendError(Text.of("Could not find a safe ocean location within search radius"));
            return 0;
        }

        ShipManager.ActiveShip ship = manager.getShip(shipId);
        source.sendFeedback(() -> Text.of(
                "\u00A7a\u00A7lShip deploying! \u00A7r\u00A7e'" + name +
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

    private static int executeStatus(ServerCommandSource source, Shipyard shipyard, ShipManager manager) {
        source.sendFeedback(() -> Text.of("\u00A76\u00A7l=== Shipyard ==="), false);
        source.sendFeedback(() -> Text.of(
                "\u00A7eBluprints loaded: \u00A7f" + shipyard.loadedCount()), false);
        source.sendFeedback(() -> Text.of(
                "\u00A7eActive ships: \u00A7f" + manager.shipCount()), false);

        for (String name : shipyard.blueprintNames()) {
            ShipData bp = shipyard.getBlueprint(name);
            String status = shipyard.isReady(name) ? "\u00A7aREADY" : "\u00A7cNOT LOADED";
            String dims = bp != null
                    ? bp.sizeX() + "x" + bp.sizeY() + "x" + bp.sizeZ() + ", " + bp.blockCount() + " blocks"
                    : "unknown";
            source.sendFeedback(() -> Text.of(
                    "  \u00A7f" + name + " " + status +
                            " \u00A77[" + dims + "] " +
                            "\u00A7epool: " + shipyard.readyCount(name)), false);
        }

        return 1;
    }
}
