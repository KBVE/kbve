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

        // /despawnship <uuid> — alias for removeship with clearer name
        dispatcher.register(
                CommandManager.literal("despawnship")
                        .requires(ServerCommandSource::isExecutedByPlayer)
                        .then(CommandManager.argument("uuid", StringArgumentType.string())
                                .executes(ctx -> {
                                    String uuidStr = StringArgumentType.getString(ctx, "uuid");
                                    return executeRemove(ctx.getSource(), manager, uuidStr);
                                })
                        )
        );

        // /boardship [uuid] — teleport to helm and mount (uuid optional, defaults to your ship)
        dispatcher.register(
                CommandManager.literal("boardship")
                        .requires(ServerCommandSource::isExecutedByPlayer)
                        .executes(ctx -> executeBoardOwned(ctx.getSource(), manager))
                        .then(CommandManager.argument("uuid", StringArgumentType.string())
                                .executes(ctx -> {
                                    String uuidStr = StringArgumentType.getString(ctx, "uuid");
                                    return executeBoard(ctx.getSource(), manager, uuidStr);
                                })
                        )
        );

        // /moveship <uuid> <distance> — sail forward along heading
        dispatcher.register(
                CommandManager.literal("moveship")
                        .requires(ServerCommandSource::isExecutedByPlayer)
                        .then(CommandManager.argument("uuid", StringArgumentType.string())
                                .then(CommandManager.argument("distance", com.mojang.brigadier.arguments.IntegerArgumentType.integer(1, 50))
                                        .executes(ctx -> {
                                            String uuidStr = StringArgumentType.getString(ctx, "uuid");
                                            int dist = com.mojang.brigadier.arguments.IntegerArgumentType.getInteger(ctx, "distance");
                                            return executeMove(ctx.getSource(), manager, uuidStr, dist);
                                        })
                                )
                        )
        );

        // /clearallships — remove every tracked ship (dev tool)
        dispatcher.register(
                CommandManager.literal("clearallships")
                        .requires(ServerCommandSource::isExecutedByPlayer)
                        .executes(ctx -> executeClearAll(ctx.getSource(), manager))
        );

        dispatcher.register(
                CommandManager.literal("shipyard")
                        .requires(ServerCommandSource::isExecutedByPlayer)
                        .executes(ctx -> executeStatus(ctx.getSource(), shipyard, manager))
        );
    }

    private static int executeClearAll(ServerCommandSource source, ShipManager manager) {
        ServerWorld world = source.getWorld();

        // 1. Clear all in-memory ships (active)
        var shipIds = new java.util.ArrayList<>(manager.getActiveShips().keySet());
        int activeCount = shipIds.size();
        for (UUID id : shipIds) {
            manager.removeShip(world, id);
        }

        // 2. Clear ships that are persisted but not currently tracked
        // (ghost ships from server restart that never re-registered in memory)
        int persistedCount = 0;
        if (com.kbve.statetree.NativeRuntime.isLoaded()) {
            String json = com.kbve.statetree.NativeRuntime.loadAllShips();
            com.google.gson.JsonArray arr = new com.google.gson.Gson().fromJson(json, com.google.gson.JsonArray.class);
            if (arr != null) {
                persistedCount = arr.size();
            }
            com.kbve.statetree.NativeRuntime.deleteAllShips();
        }

        int total = activeCount + persistedCount;
        final int finalTotal = total;
        final int finalActive = activeCount;
        final int finalPersisted = persistedCount;
        if (total == 0) {
            source.sendFeedback(() -> Text.of("\u00A7eNo ships to clear."), false);
            return 0;
        }

        source.sendFeedback(() -> Text.of(
                "\u00A7a\u00A7lCleared " + finalTotal + " ship(s) \u00A7r\u00A7e(" +
                        finalActive + " active, " + finalPersisted + " persisted records)"), true);
        return 1;
    }

    private static int executeMove(ServerCommandSource source, ShipManager manager, String uuidStr, int distance) {
        UUID shipId;
        try {
            shipId = UUID.fromString(uuidStr);
        } catch (IllegalArgumentException e) {
            source.sendError(Text.of("Invalid UUID: " + uuidStr));
            return 0;
        }

        ShipManager.ActiveShip ship = manager.getShip(shipId);
        if (ship == null) {
            source.sendError(Text.of("No active ship with id: " + shipId));
            return 0;
        }

        if (manager.getMover().isMoving(shipId)) {
            source.sendError(Text.of("Ship is already moving — wait for current move to finish"));
            return 0;
        }

        manager.moveShip(shipId, distance);
        source.sendFeedback(() -> Text.of(
                "\u00A7eSailing " + distance + " blocks (heading " +
                        String.format("%.0f", ship.heading) + "\u00B0)"), false);
        return 1;
    }

    private static int executeBoardOwned(ServerCommandSource source, ShipManager manager) {
        ServerPlayerEntity player = source.getPlayer();
        if (player == null) {
            source.sendError(Text.of("This command must be run by a player"));
            return 0;
        }

        // Find the player's ship by owner UUID
        UUID playerUuid = player.getUuid();
        int shipCount = manager.getActiveShips().size();

        if (shipCount == 0) {
            source.sendError(Text.of("No ships exist. Use /spawnship <name> first."));
            return 0;
        }

        for (var entry : manager.getActiveShips().entrySet()) {
            ShipManager.ActiveShip ship = entry.getValue();
            if (ship.ownerUuid.equals(playerUuid)) {
                return executeBoard(source, manager, ship.shipId.toString());
            }
        }

        // Debug: show why no match
        source.sendError(Text.of("No ship owned by you (uuid=" + playerUuid + "). " +
                shipCount + " ship(s) exist. Try /boardship <uuid> with the ship ID from /shipyard."));
        return 0;
    }

    private static int executeBoard(ServerCommandSource source, ShipManager manager, String uuidStr) {
        UUID shipId;
        try {
            shipId = UUID.fromString(uuidStr);
        } catch (IllegalArgumentException e) {
            source.sendError(Text.of("Invalid UUID: " + uuidStr));
            return 0;
        }

        ServerPlayerEntity player = source.getPlayer();
        if (player == null) {
            source.sendError(Text.of("This command must be run by a player"));
            return 0;
        }

        ServerWorld world = source.getWorld();
        if (manager.boardShip(world, shipId, player)) {
            source.sendFeedback(() -> Text.of(
                    "\u00A7a\u00A7lAll aboard! \u00A7r\u00A7eUse WASD to sail. Sneak to dismount."), false);
            return 1;
        } else {
            source.sendError(Text.of("Could not board ship — helm not found"));
            return 0;
        }
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
            // Not loaded yet — trigger background load and notify when ready
            String shipName = name;
            ServerPlayerEntity notifyPlayer = player;
            shipyard.ensureLoaded(name, () -> {
                // Callback runs on loader thread — sendMessage is thread-safe
                // for ServerPlayerEntity (queues a network packet)
                if (notifyPlayer.isAlive()) {
                    notifyPlayer.sendMessage(Text.of(
                            "\u00A7a\u00A7l[Shipyard] \u00A7r\u00A7e'" + shipName +
                                    "' is ready! Run \u00A7f/spawnship " + shipName +
                                    "\u00A7e again to deploy."), false);
                }
            });

            if (shipyard.isLoading(name)) {
                source.sendFeedback(() -> Text.of(
                        "\u00A7e[Shipyard] Loading '" + name + "'... You'll be notified when it's ready."), false);
            } else {
                source.sendFeedback(() -> Text.of(
                        "\u00A7e[Shipyard] Preparing '" + name + "'... You'll be notified when it's ready."), false);
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
        int estSeconds = data.blockCount() / 500 / 20; // 500 blocks/tick, 20 ticks/sec
        source.sendFeedback(() -> Text.of(
                "\u00A7a\u00A7lShip deploying! \u00A7r\u00A7e'" + name +
                        "' at " + ship.anchor.toShortString() +
                        " (~" + estSeconds + "s to build, " + data.blockCount() + " blocks)" +
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
