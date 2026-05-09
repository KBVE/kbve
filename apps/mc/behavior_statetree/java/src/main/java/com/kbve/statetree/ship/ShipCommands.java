package com.kbve.statetree.ship;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;

import java.util.UUID;

/**
 * Ship commands — simplified for entity-based BBModel ships.
 */
public final class ShipCommands {

    private static final String DEFAULT_NAMESPACE = "immersive_aircraft";

    /** Short names exposed in /spawnship autocomplete. */
    private static final String[] SHIP_MODELS = {
            "airship",
            "biplane",
            "gyrodyne"
    };

    private ShipCommands() {}

    private static String resolveModelPath(String input) {
        return input.contains("/") ? input : DEFAULT_NAMESPACE + "/" + input;
    }

    public static void register(CommandDispatcher<ServerCommandSource> dispatcher,
                                ShipManager manager) {
        dispatcher.register(CommandManager.literal("spawnship")
                .requires(ServerCommandSource::isExecutedByPlayer)
                .then(CommandManager.argument("model", StringArgumentType.string())
                        .suggests((ctx, builder) -> {
                            for (String model : SHIP_MODELS) builder.suggest(model);
                            return builder.buildFuture();
                        })
                        .executes(ctx -> {
                            ServerPlayerEntity player = ctx.getSource().getPlayer();
                            String input = StringArgumentType.getString(ctx, "model");
                            String modelName = resolveModelPath(input);
                            ServerWorld world = ctx.getSource().getWorld();
                            ShipEntity ship = manager.placeShip(world, modelName,
                                    player.getUuid(), player.getName().getString(),
                                    player.getBlockPos());
                            if (ship != null) {
                                ctx.getSource().sendFeedback(
                                        () -> Text.of("Spawned " + modelName + " (id=" + ship.getShipId() + "). /boardship " + ship.getShipId() + " to teleport on."), true);
                                return 1;
                            }
                            ctx.getSource().sendError(Text.of("Failed to spawn ship"));
                            return 0;
                        })));

        com.mojang.brigadier.suggestion.SuggestionProvider<ServerCommandSource> shipUuidSuggestions =
                (ctx, builder) -> {
                    for (UUID id : manager.getActiveShips().keySet()) {
                        builder.suggest(id.toString());
                    }
                    return builder.buildFuture();
                };

        dispatcher.register(CommandManager.literal("removeship")
                .requires(ServerCommandSource::isExecutedByPlayer)
                .then(CommandManager.argument("uuid", StringArgumentType.string())
                        .suggests(shipUuidSuggestions)
                        .executes(ctx -> {
                            String uuidStr = StringArgumentType.getString(ctx, "uuid");
                            try {
                                UUID shipId = UUID.fromString(uuidStr);
                                manager.removeShip(ctx.getSource().getWorld(), shipId);
                                ctx.getSource().sendFeedback(() -> Text.of("Removed ship " + uuidStr), true);
                                return 1;
                            } catch (IllegalArgumentException e) {
                                ctx.getSource().sendError(Text.of("Invalid UUID: " + uuidStr));
                                return 0;
                            }
                        })));

        dispatcher.register(CommandManager.literal("boardship")
                .requires(ServerCommandSource::isExecutedByPlayer)
                .then(CommandManager.argument("uuid", StringArgumentType.string())
                        .suggests(shipUuidSuggestions)
                        .executes(ctx -> {
                            ServerPlayerEntity player = ctx.getSource().getPlayer();
                            String uuidStr = StringArgumentType.getString(ctx, "uuid");
                            try {
                                UUID shipId = UUID.fromString(uuidStr);
                                manager.boardShip(ctx.getSource().getWorld(), player, shipId);
                                ctx.getSource().sendFeedback(() -> Text.of("Boarding ship " + uuidStr), false);
                                return 1;
                            } catch (IllegalArgumentException e) {
                                ctx.getSource().sendError(Text.of("Invalid UUID: " + uuidStr));
                                return 0;
                            }
                        })));

        dispatcher.register(CommandManager.literal("clearallships")
                .requires(ServerCommandSource::isExecutedByPlayer)
                .executes(ctx -> {
                    manager.clearAll(ctx.getSource().getWorld());
                    ctx.getSource().sendFeedback(() -> Text.of("All ships cleared"), true);
                    return 1;
                }));

        // /listships — print every active ship's id, model, and distance
        // from the executing player. Helpful for finding a parked ship
        // after dismounting and wandering off.
        dispatcher.register(CommandManager.literal("listships")
                .requires(ServerCommandSource::isExecutedByPlayer)
                .executes(ctx -> {
                    ServerCommandSource src = ctx.getSource();
                    var origin = src.getPosition();
                    var ships = manager.getActiveShips();
                    if (ships.isEmpty()) {
                        src.sendFeedback(() -> Text.of("No active ships"), false);
                        return 0;
                    }
                    src.sendFeedback(() -> Text.of("§eActive ships: " + ships.size()), false);
                    ships.values().stream()
                            .sorted((a, b) -> Double.compare(
                                    a.squaredDistanceTo(origin.x, origin.y, origin.z),
                                    b.squaredDistanceTo(origin.x, origin.y, origin.z)))
                            .limit(10)
                            .forEach(ship -> {
                                double dist = Math.sqrt(ship.squaredDistanceTo(origin.x, origin.y, origin.z));
                                String name = ship.getShipName().isEmpty() ? "Ship" : ship.getShipName();
                                String label = String.format("§7• §f%s §7(%s) §a%.0fm §7@ %d, %d, %d  §8%s",
                                        name, ship.getModelName(), dist,
                                        (int) ship.getX(), (int) ship.getY(), (int) ship.getZ(),
                                        ship.getShipId());
                                src.sendFeedback(() -> Text.of(label), false);
                            });
                    return 1;
                }));
    }
}
