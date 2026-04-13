package com.kbve.statetree.ship;

import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.MovementType;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

import java.util.UUID;

/**
 * Invisible anchor entity that represents a ship in the world.
 *
 * <p>The ship's blocks exist as real blocks placed by {@link ShipManager}.
 * This entity sits at the ship's anchor point and serves as:
 * <ul>
 *   <li>The rideable target — players right-click a ship block, which
 *       mounts them on this entity</li>
 *   <li>The movement controller — when this entity moves, the
 *       ShipManager relocates all ship blocks to follow</li>
 *   <li>The network sync anchor — only this entity's position is
 *       replicated, not the blocks (they're world state)</li>
 * </ul>
 *
 * <p>The entity is invisible with no collision box of its own — the
 * ship blocks provide the visual and collision.
 */
public class ShipEntity extends Entity {

    private UUID shipId;
    private UUID ownerUuid;
    private float heading = 0.0f;
    private float targetSpeed = 0.0f;

    public ShipEntity(EntityType<?> type, World world) {
        super(type, world);
        this.setInvisible(true);
        this.setNoGravity(true);
    }

    // -- Ship state ---------------------------------------------------------

    public UUID getShipId() { return shipId; }
    public void setShipId(UUID id) { this.shipId = id; }

    public UUID getOwnerUuid() { return ownerUuid; }
    public void setOwnerUuid(UUID uuid) { this.ownerUuid = uuid; }

    public float getHeading() { return heading; }
    public void setHeading(float heading) { this.heading = heading % 360; }

    public float getTargetSpeed() { return targetSpeed; }
    public void setTargetSpeed(float speed) { this.targetSpeed = Math.max(0, speed); }

    // -- Interaction --------------------------------------------------------

    @Override
    public ActionResult interact(PlayerEntity player, Hand hand) {
        if (player.isSneaking()) {
            // Sneak + right-click = dismount (handled by vanilla)
            return ActionResult.PASS;
        }

        if (!this.getWorld().isClient() && !this.hasPassengers()) {
            player.startRiding(this);
            return ActionResult.SUCCESS;
        }
        return ActionResult.PASS;
    }

    @Override
    protected boolean canAddPassenger(Entity passenger) {
        // Only one captain at a time (for now)
        return !this.hasPassengers() && passenger instanceof PlayerEntity;
    }

    // -- Movement -----------------------------------------------------------

    @Override
    public void tick() {
        super.tick();

        if (this.getWorld().isClient()) return;
        if (targetSpeed <= 0.0f) return;
        if (!this.hasPassengers()) return;

        // Move along heading
        double rad = Math.toRadians(heading);
        double dx = -Math.sin(rad) * targetSpeed * 0.05; // 0.05 = tick scale
        double dz = Math.cos(rad) * targetSpeed * 0.05;

        this.move(MovementType.SELF, new Vec3d(dx, 0, dz));
    }

    /**
     * Steer the ship based on the rider's look direction.
     * Called from a tick handler when a player is riding.
     */
    public void steerFromRider(PlayerEntity rider) {
        float forward = rider.forwardSpeed;
        float sideways = rider.sidewaysSpeed;

        if (forward > 0) {
            targetSpeed = Math.min(targetSpeed + 0.1f, 3.0f);
        } else if (forward < 0) {
            targetSpeed = Math.max(targetSpeed - 0.2f, 0.0f);
        }

        if (sideways != 0) {
            heading += sideways > 0 ? -2.0f : 2.0f;
        }
    }

    // -- Serialization ------------------------------------------------------

    @Override
    protected void initDataTracker(net.minecraft.entity.data.DataTracker.Builder builder) {
        // No tracked data for now — ship state is managed server-side
    }

    @Override
    protected void readCustomDataFromNbt(NbtCompound nbt) {
        if (nbt.containsUuid("ShipId")) {
            this.shipId = nbt.getUuid("ShipId");
        }
        if (nbt.containsUuid("OwnerUuid")) {
            this.ownerUuid = nbt.getUuid("OwnerUuid");
        }
        this.heading = nbt.getFloat("Heading");
        this.targetSpeed = nbt.getFloat("TargetSpeed");
    }

    @Override
    protected void writeCustomDataToNbt(NbtCompound nbt) {
        if (shipId != null) {
            nbt.putUuid("ShipId", shipId);
        }
        if (ownerUuid != null) {
            nbt.putUuid("OwnerUuid", ownerUuid);
        }
        nbt.putFloat("Heading", heading);
        nbt.putFloat("TargetSpeed", targetSpeed);
    }
}
