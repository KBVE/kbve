package com.kbve.statetree.ship;

import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.MovementType;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.storage.ReadView;
import net.minecraft.storage.WriteView;
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
 *   <li>The rideable target — players right-click to mount</li>
 *   <li>The movement controller — WASD steers while riding</li>
 *   <li>The network sync anchor — only this entity replicates</li>
 * </ul>
 */
public class ShipEntity extends Entity {

    private String shipIdStr = "";
    private String ownerUuidStr = "";
    private float heading = 0.0f;
    private float targetSpeed = 0.0f;

    public ShipEntity(EntityType<?> type, World world) {
        super(type, world);
        this.setInvisible(true);
        this.setNoGravity(true);
    }

    // -- Ship state ---------------------------------------------------------

    public UUID getShipId() {
        return shipIdStr.isEmpty() ? null : UUID.fromString(shipIdStr);
    }

    public void setShipId(UUID id) {
        this.shipIdStr = id != null ? id.toString() : "";
    }

    public UUID getOwnerUuid() {
        return ownerUuidStr.isEmpty() ? null : UUID.fromString(ownerUuidStr);
    }

    public void setOwnerUuid(UUID uuid) {
        this.ownerUuidStr = uuid != null ? uuid.toString() : "";
    }

    public float getHeading() { return heading; }
    public void setHeading(float heading) { this.heading = heading % 360; }

    public float getTargetSpeed() { return targetSpeed; }
    public void setTargetSpeed(float speed) { this.targetSpeed = Math.max(0, speed); }

    // -- Interaction --------------------------------------------------------

    @Override
    public ActionResult interact(PlayerEntity player, Hand hand) {
        if (player.isSneaking()) {
            return ActionResult.PASS;
        }

        // Server-side only — ServerPlayerEntity only exists on server
        if (player instanceof ServerPlayerEntity && !this.hasPassengers()) {
            player.startRiding(this);
            return ActionResult.SUCCESS;
        }
        return ActionResult.PASS;
    }

    @Override
    protected boolean canAddPassenger(Entity passenger) {
        return !this.hasPassengers() && passenger instanceof PlayerEntity;
    }

    // -- Movement -----------------------------------------------------------

    @Override
    public void tick() {
        super.tick();

        // Only move on server — check for rider being ServerPlayerEntity
        if (targetSpeed <= 0.0f) return;
        if (!this.hasPassengers()) return;
        Entity rider = this.getFirstPassenger();
        if (!(rider instanceof ServerPlayerEntity)) return;

        double rad = Math.toRadians(heading);
        double dx = -Math.sin(rad) * targetSpeed * 0.05;
        double dz = Math.cos(rad) * targetSpeed * 0.05;

        this.move(MovementType.SELF, new Vec3d(dx, 0, dz));
    }

    /**
     * Steer the ship based on the rider's input.
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

    // -- Serialization (1.21.11 WriteView / ReadView API) -------------------

    @Override
    protected void initDataTracker(net.minecraft.entity.data.DataTracker.Builder builder) {
        // No tracked data — ship state is managed server-side
    }

    @Override
    public void readCustomData(ReadView view) {
        this.shipIdStr = view.getString("ShipId", "");
        this.ownerUuidStr = view.getString("OwnerUuid", "");
        this.heading = view.getFloat("Heading", 0.0f);
        this.targetSpeed = view.getFloat("TargetSpeed", 0.0f);
    }

    @Override
    public void writeCustomData(WriteView view) {
        view.putString("ShipId", shipIdStr);
        view.putString("OwnerUuid", ownerUuidStr);
        view.putFloat("Heading", heading);
        view.putFloat("TargetSpeed", targetSpeed);
    }
}
