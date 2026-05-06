package com.kbve.statetree.ship;

import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.RaycastContext;
import net.minecraft.world.World;

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
            entity.setShipHealth(ShipEntity.MAX_HEALTH);
            entity.refreshPositionAndAngles(pos.x, pos.y + 1.0, pos.z, user.getYaw(), 0);

            if (!serverWorld.spawnEntity(entity)) {
                return ActionResult.FAIL;
            }

            if (!user.getAbilities().creativeMode) {
                stack.decrement(1);
            }
        }

        return ActionResult.SUCCESS;
    }
}
