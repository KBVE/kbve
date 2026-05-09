package com.kbve.statetree.ship;

import net.minecraft.component.type.TooltipDisplayComponent;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.tooltip.TooltipType;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.RaycastContext;
import net.minecraft.world.World;

import java.util.function.Consumer;

public class ShipItem extends Item {

    private final String modelName;

    public ShipItem(Settings settings, String modelName) {
        super(settings);
        this.modelName = modelName;
    }

    @Override
    public ActionResult use(World world, PlayerEntity user, Hand hand) {
        ItemStack stack = user.getStackInHand(hand);

        Vec3d eye = user.getEyePos();
        Vec3d look = user.getRotationVec(1.0f);
        Vec3d end = eye.add(look.x * 5.0, look.y * 5.0, look.z * 5.0);
        BlockHitResult hit = world.raycast(new RaycastContext(
                eye, end,
                RaycastContext.ShapeType.OUTLINE,
                RaycastContext.FluidHandling.NONE,
                user));

        if (hit.getType() != HitResult.Type.BLOCK) {
            return ActionResult.PASS;
        }

        if (world instanceof ServerWorld serverWorld) {
            Vec3d pos = hit.getPos();
            ShipEntity entity = new ShipEntity(ShipEntityTypes.SHIP, world);
            entity.setShipId(java.util.UUID.randomUUID());
            entity.setOwnerUuid(user.getUuid());
            entity.setModelName(modelName);
            entity.refreshPositionAndAngles(pos.x, pos.y + 1.0, pos.z, user.getYaw(), 0);

            // Restore packed state from CUSTOM_DATA component if present —
            // pickup mechanic stores the ship's name/HP/fuel here so a
            // packed ship redeploys with whatever shape it was packed in.
            float restoredHealth = ShipEntity.MAX_HEALTH;
            float restoredFuel = ShipEntity.MAX_FUEL * 0.5f;
            net.minecraft.component.type.NbtComponent comp =
                    stack.get(net.minecraft.component.DataComponentTypes.CUSTOM_DATA);
            if (comp != null) {
                net.minecraft.nbt.NbtCompound nbt = comp.copyNbt();
                nbt.getString("Name").ifPresent(entity::setShipName);
                restoredHealth = nbt.getFloat("Health").orElse(ShipEntity.MAX_HEALTH);
                restoredFuel   = nbt.getFloat("Fuel").orElse(ShipEntity.MAX_FUEL * 0.5f);
            }
            entity.setShipHealth(restoredHealth);
            entity.setFuelLevel(restoredFuel);

            if (!serverWorld.spawnEntity(entity)) {
                return ActionResult.FAIL;
            }

            if (!user.getAbilities().creativeMode) {
                stack.decrement(1);
            }
        }

        return ActionResult.SUCCESS;
    }

    @Override
    public void appendTooltip(ItemStack stack, TooltipContext ctx,
                              TooltipDisplayComponent display,
                              Consumer<Text> tooltip,
                              TooltipType type) {
        super.appendTooltip(stack, ctx, display, tooltip, type);
        FlightStats s = FlightStatsRegistry.get(modelName);
        boolean isPlane = s.pitchSpeed() > 0f;
        tooltip.accept(Text.literal(isPlane ? "§7Type: §fPlane" : "§7Type: §fRotorcraft"));
        tooltip.accept(Text.literal(String.format("§7Engine: §a%.2f §7m/tick", s.engineSpeed())));
        if (isPlane) {
            tooltip.accept(Text.literal(String.format("§7Pitch: §a%.1f° §7Glide: §a%.2f",
                    s.pitchSpeed(), s.glideFactor())));
        } else {
            tooltip.accept(Text.literal(String.format("§7Vertical: §a%.2f §7m/tick", s.verticalSpeed())));
        }
        tooltip.accept(Text.literal(String.format("§7Yaw: §a%.1f°/tick §7Lift: §a%.2f",
                s.yawSpeed(), s.lift())));
        tooltip.accept(Text.literal(String.format("§7Bbox: §a%.1f×%.1f §7Wind: §a%.2f",
                s.boundingWidth(), s.boundingHeight(), s.wind())));
        if (s.canExplodeOnCrash()) {
            tooltip.accept(Text.literal("§c⚠ Explodes on hard impact"));
        }
        tooltip.accept(Text.literal("§8Sneak + right-click ship to open inventory"));
    }
}
