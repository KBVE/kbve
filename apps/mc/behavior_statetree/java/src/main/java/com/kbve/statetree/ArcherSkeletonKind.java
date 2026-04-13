package com.kbve.statetree;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.mob.SkeletonEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import org.jetbrains.annotations.Nullable;

/**
 * Archer skeleton archetype: bow, chainmail, range-keeper.
 *
 * <p>The ranged DPS of the skeleton army. Maintains distance from players,
 * backs away if they close in, and shoots arrows from range. The Rust
 * behavior tree emits {@code ShootArrow} commands and {@code MaintainRange}
 * repositioning. Lighter armor than melee but longer observation range.
 */
final class ArcherSkeletonKind implements CreatureKind {

    private static final double OBSERVATION_RANGE = 24.0;

    @Override
    public String tag() {
        return "skeleton_archer";
    }

    @Override
    public @Nullable MobEntity create(ServerWorld world, BlockPos pos, @Nullable Entity owner) {
        SkeletonEntity skeleton = EntityType.SKELETON.create(world, SpawnReason.COMMAND);
        if (skeleton == null) return null;

        skeleton.refreshPositionAndAngles(
                pos.getX() + 0.5, pos.getY(), pos.getZ() + 0.5,
                world.getRandom().nextFloat() * 360, 0
        );
        skeleton.setCustomName(Text.of("\u00A7eSkull Archer"));
        skeleton.setCustomNameVisible(true);
        skeleton.setPersistent();

        // Light armor — chainmail helmet, no chest
        skeleton.equipStack(EquipmentSlot.HEAD, new ItemStack(Items.CHAINMAIL_HELMET));
        skeleton.setEquipmentDropChance(EquipmentSlot.HEAD, 0.0f);
        // Bow — the default skeleton weapon, but we set it explicitly
        skeleton.equipStack(EquipmentSlot.MAINHAND, new ItemStack(Items.BOW));
        skeleton.setEquipmentDropChance(EquipmentSlot.MAINHAND, 0.0f);
        return skeleton;
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
