package com.kbve.statetree;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.mob.SkeletonEntity;
import net.minecraft.entity.mob.SkeletonHorseEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import org.jetbrains.annotations.Nullable;

/**
 * Skeleton Horseman archetype: armored skeleton riding a skeleton horse.
 *
 * <p>Spawns a {@link SkeletonHorseEntity} with a {@link SkeletonEntity} rider
 * equipped with a bow and iron armor. The rider is the tracked entity — when
 * it dies, the orphan sweep in {@link AiCreatureManager} automatically
 * discards the horse (both carry the {@code kbve_ai_creature} tag but only
 * the rider has a tracking slot).
 *
 * <p>Horsemen are designed to spawn in packs via the
 * {@code SpawnSkeletonHorsemenPack} world command, paired with foot archers
 * for a combined cavalry + infantry assault.
 */
final class HorsemanSkeletonKind implements CreatureKind {

    private static final double OBSERVATION_RANGE = 28.0;

    /** Scoreboard tag — must match {@link AiCreatureManager#AI_MARKER_TAG}. */
    private static final String AI_MARKER_TAG = "kbve_ai_creature";

    @Override
    public String tag() {
        return "skeleton_horseman";
    }

    @Override
    public @Nullable MobEntity create(ServerWorld world, BlockPos pos, @Nullable Entity owner) {
        // 1. Spawn the skeleton horse (vehicle)
        SkeletonHorseEntity horse = EntityType.SKELETON_HORSE.create(world, SpawnReason.COMMAND);
        if (horse == null) return null;

        horse.refreshPositionAndAngles(
                pos.getX() + 0.5, pos.getY(), pos.getZ() + 0.5,
                world.getRandom().nextFloat() * 360, 0
        );
        horse.setPersistent();
        horse.setTame(true);
        // Tag the horse so the orphan sweep cleans it up when the rider dies
        horse.addCommandTag(AI_MARKER_TAG);

        if (!world.spawnEntity(horse)) return null;

        // 2. Spawn the skeleton rider
        SkeletonEntity rider = EntityType.SKELETON.create(world, SpawnReason.COMMAND);
        if (rider == null) {
            horse.discard();
            return null;
        }

        rider.refreshPositionAndAngles(
                pos.getX() + 0.5, pos.getY(), pos.getZ() + 0.5,
                world.getRandom().nextFloat() * 360, 0
        );
        rider.setCustomName(Text.of("\u00A74Skull Horseman"));
        rider.setCustomNameVisible(true);
        rider.setPersistent();

        // Iron armor — tougher than foot archers
        rider.equipStack(EquipmentSlot.HEAD, new ItemStack(Items.IRON_HELMET));
        rider.setEquipmentDropChance(EquipmentSlot.HEAD, 0.0f);
        rider.equipStack(EquipmentSlot.CHEST, new ItemStack(Items.IRON_CHESTPLATE));
        rider.setEquipmentDropChance(EquipmentSlot.CHEST, 0.0f);
        // Bow for ranged attacks
        rider.equipStack(EquipmentSlot.MAINHAND, new ItemStack(Items.BOW));
        rider.setEquipmentDropChance(EquipmentSlot.MAINHAND, 0.0f);

        // 3. Mount the rider onto the horse
        rider.startRiding(horse);

        return rider;
    }

    @Override
    public void gatherNearbyEntities(
            ServerWorld world, MobEntity self, @Nullable Entity owner, JsonArray out) {
        Box searchBox = self.getBoundingBox().expand(OBSERVATION_RANGE);
        for (ServerPlayerEntity player : world.getPlayers()) {
            if (!searchBox.contains(player.getX(), player.getY(), player.getZ())) continue;
            JsonObject ent = new JsonObject();
            ent.addProperty("entity_id", player.getId());
            ent.addProperty("entity_type", "player");
            JsonArray ePos = new JsonArray();
            ePos.add(player.getX());
            ePos.add(player.getY());
            ePos.add(player.getZ());
            ent.add("position", ePos);
            ent.addProperty("health", player.getHealth());
            ent.addProperty("is_hostile", true);
            out.add(ent);
        }
    }
}
