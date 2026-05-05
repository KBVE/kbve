package com.kbve.statetree.ship;

import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.MovementType;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
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
 * Entity-based ship rendered via BBModel. No blocks placed in the world.
 *
 * <p>The entity serves as:
 * <ul>
 *   <li>The visual anchor — {@code BBModelShipRenderer} draws the model here</li>
 *   <li>The rideable target — players right-click to mount</li>
 *   <li>The movement controller — WASD steers while riding</li>
 *   <li>The network sync anchor — only this entity replicates</li>
 * </ul>
 */
public class ShipEntity extends Entity {

    // Tracked data syncs to clients via vanilla entity tracking.
    // Avoids the need for custom Spawn/Status network payloads.
    private static final TrackedData<String> MODEL_NAME =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.STRING);
    private static final TrackedData<String> SHIP_NAME =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.STRING);
    private static final TrackedData<String> SHIP_ID =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.STRING);

    private String ownerUuidStr = "";
    private float heading = 0.0f;
    private float targetSpeed = 0.0f;
    private float verticalIntent = 0.0f;

    public ShipEntity(EntityType<?> type, World world) {
        super(type, world);
        this.setNoGravity(true);
    }

    // -- Ship state ---------------------------------------------------------

    public UUID getShipId() {
        String id = this.dataTracker.get(SHIP_ID);
        return id.isEmpty() ? null : UUID.fromString(id);
    }

    public void setShipId(UUID id) {
        this.dataTracker.set(SHIP_ID, id != null ? id.toString() : "");
    }

    public UUID getOwnerUuid() {
        return ownerUuidStr.isEmpty() ? null : UUID.fromString(ownerUuidStr);
    }

    public void setOwnerUuid(UUID uuid) {
        this.ownerUuidStr = uuid != null ? uuid.toString() : "";
    }

    public String getModelName() { return this.dataTracker.get(MODEL_NAME); }
    public void setModelName(String name) {
        this.dataTracker.set(MODEL_NAME, name != null ? name : "");
    }

    public String getShipName() { return this.dataTracker.get(SHIP_NAME); }
    public void setShipName(String name) {
        this.dataTracker.set(SHIP_NAME, name != null ? name : "");
    }

    public float getHeading() { return heading; }
    public void setHeading(float heading) {
        this.heading = heading % 360;
        this.setYaw(this.heading);
    }

    public float getTargetSpeed() { return targetSpeed; }
    public void setTargetSpeed(float speed) { this.targetSpeed = Math.max(0, speed); }

    public float getVerticalIntent() { return verticalIntent; }
    public void setVerticalIntent(float v) { this.verticalIntent = Math.max(-1f, Math.min(1f, v)); }

    @Override
    public boolean damage(net.minecraft.server.world.ServerWorld world,
                          net.minecraft.entity.damage.DamageSource source,
                          float amount) {
        return false;
    }

    @Override
    public boolean isCollidable(Entity other) {
        return true;
    }

    @Override
    public boolean canHit() {
        return true;
    }

    @Override
    public ActionResult interact(PlayerEntity player, Hand hand) {
        if (player.isSneaking()) return ActionResult.PASS;

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

    @Override
    public void tick() {
        super.tick();

        this.setYaw(heading);

        if (!this.hasPassengers()) return;
        Entity rider = this.getFirstPassenger();
        if (!(rider instanceof ServerPlayerEntity)) return;

        double rad = Math.toRadians(heading);
        double dx = -Math.sin(rad) * targetSpeed * 0.05;
        double dz = Math.cos(rad) * targetSpeed * 0.05;
        double dy = verticalIntent * 0.15;

        if (dx == 0 && dy == 0 && dz == 0) return;

        this.move(MovementType.SELF, new Vec3d(dx, dy, dz));

        if (targetSpeed > 0.5f && this.getEntityWorld() instanceof net.minecraft.server.world.ServerWorld sw) {
            if (this.age % 4 == 0) {
                sw.spawnParticles(net.minecraft.particle.ParticleTypes.CAMPFIRE_COSY_SMOKE,
                        this.getX(), this.getY() + 1.0, this.getZ(),
                        1, 0.1, 0.05, 0.1, 0.01);
            }
        }
    }

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

    @Override
    protected void initDataTracker(net.minecraft.entity.data.DataTracker.Builder builder) {
        builder.add(MODEL_NAME, "immersive_aircraft/airship");
        builder.add(SHIP_NAME, "");
        builder.add(SHIP_ID, "");
    }

    @Override
    public void readCustomData(ReadView view) {
        this.dataTracker.set(SHIP_ID, view.getString("ShipId", ""));
        this.ownerUuidStr = view.getString("OwnerUuid", "");
        setModelName(view.getString("ModelName", "immersive_aircraft/airship"));
        setShipName(view.getString("ShipName", ""));
        this.heading = view.getFloat("Heading", 0.0f);
        this.targetSpeed = view.getFloat("TargetSpeed", 0.0f);
    }

    @Override
    public void writeCustomData(WriteView view) {
        view.putString("ShipId", this.dataTracker.get(SHIP_ID));
        view.putString("OwnerUuid", ownerUuidStr);
        view.putString("ModelName", getModelName());
        view.putString("ShipName", getShipName());
        view.putFloat("Heading", heading);
        view.putFloat("TargetSpeed", targetSpeed);
    }
}
