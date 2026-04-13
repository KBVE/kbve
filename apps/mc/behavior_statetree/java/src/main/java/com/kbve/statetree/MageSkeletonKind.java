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
 * Mage skeleton archetype: robed, blaze rod staff, teleport ability.
 *
 * <p>The infiltrator of the skeleton army. When the path is blocked by
 * walls or cliffs, the Rust behavior tree emits {@code Teleport} commands
 * to warp past obstacles (enderman-style particles + sound). Light armor
 * but high mobility.
 */
final class MageSkeletonKind implements CreatureKind {

    private static final double OBSERVATION_RANGE = 20.0;

    @Override
    public String tag() {
        return "skeleton_mage";
    }

    @Override
    public @Nullable MobEntity create(ServerWorld world, BlockPos pos, @Nullable Entity owner) {
        SkeletonEntity skeleton = EntityType.SKELETON.create(world, SpawnReason.COMMAND);
        if (skeleton == null) return null;

        skeleton.refreshPositionAndAngles(
                pos.getX() + 0.5, pos.getY(), pos.getZ() + 0.5,
                world.getRandom().nextFloat() * 360, 0
        );
        skeleton.setCustomName(Text.of("\u00A75Skeleton Mage"));
        skeleton.setCustomNameVisible(true);
        skeleton.setPersistent();

        // Mage look — leather helmet (dyed purple via NBT later if desired)
        skeleton.equipStack(EquipmentSlot.HEAD, new ItemStack(Items.LEATHER_HELMET));
        skeleton.setEquipmentDropChance(EquipmentSlot.HEAD, 0.0f);
        // Blaze rod as "staff"
        skeleton.equipStack(EquipmentSlot.MAINHAND, new ItemStack(Items.BLAZE_ROD));
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
