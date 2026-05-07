package com.kbve.statetree.ship;

import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityDimensions;
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
    private static final TrackedData<Float> SHIP_HEALTH =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.FLOAT);
    // Synced inputs — clients read these to run the same smoothing locally,
    // so enginePower / bankRoll match without per-tick float spam.
    private static final TrackedData<Float> TARGET_SPEED =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.FLOAT);
    private static final TrackedData<Float> VERTICAL_INTENT =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.FLOAT);

    public static final float MAX_HEALTH = 100.0f;

    // Flight-feel constants (ported from ImmersiveAircraft airship.json).
    // ENGINE_REACTION_SPEED ticks for power to fully ramp toward target.
    // Higher = more momentum / sluggish; lower = snappy.
    private static final float ENGINE_REACTION_SPEED = 50.0f;
    private static final float VERTICAL_REACTION_SPEED = 20.0f;
    // Heading-banking visual hint (deg) — exposed for client roll mixin.
    private static final float ROLL_FACTOR = 5.0f;

    private String ownerUuidStr = "";

    // Smoothed flight state — runs identically on server and client so the
    // renderer reads consistent values without per-tick TrackedData churn.
    private final InterpolatedFloat enginePower = new InterpolatedFloat(ENGINE_REACTION_SPEED);
    private final InterpolatedFloat verticalDrive = new InterpolatedFloat(VERTICAL_REACTION_SPEED);
    private float lastHeading = 0.0f;
    private float bankRoll = 0.0f;

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

    public float getHeading() { return this.getYaw(); }
    public void setHeading(float heading) {
        this.setYaw(heading % 360f);
    }

    public float getTargetSpeed() { return this.dataTracker.get(TARGET_SPEED); }
    public void setTargetSpeed(float speed) {
        this.dataTracker.set(TARGET_SPEED, Math.max(0f, speed));
    }

    public float getVerticalIntent() { return this.dataTracker.get(VERTICAL_INTENT); }
    public void setVerticalIntent(float v) {
        this.dataTracker.set(VERTICAL_INTENT, Math.max(-1f, Math.min(1f, v)));
    }

    public float getShipHealth() { return this.dataTracker.get(SHIP_HEALTH); }
    public void setShipHealth(float hp) {
        this.dataTracker.set(SHIP_HEALTH, Math.max(0f, Math.min(MAX_HEALTH, hp)));
    }

    @Override
    public boolean damage(net.minecraft.server.world.ServerWorld world,
                          net.minecraft.entity.damage.DamageSource source,
                          float amount) {
        if (this.isRemoved()) return false;
        if (source.isIn(net.minecraft.registry.tag.DamageTypeTags.IS_FIRE)) return false;
        if (source.isIn(net.minecraft.registry.tag.DamageTypeTags.IS_FALL)) return false;

        float newHp = getShipHealth() - amount;
        setShipHealth(newHp);
        if (newHp <= 0f) {
            this.removeAllPassengers();
            this.discard();
        }
        return true;
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

        net.minecraft.item.ItemStack stack = player.getStackInHand(hand);
        if (stack.isOf(net.minecraft.item.Items.IRON_INGOT) && getShipHealth() < MAX_HEALTH) {
            float before = getShipHealth();
            setShipHealth(before + 25.0f);
            if (!player.getAbilities().creativeMode) {
                stack.decrement(1);
            }
            if (!this.getEntityWorld().isClient()) {
                player.sendMessage(net.minecraft.text.Text.of(
                        String.format("Ship repaired: %.0f → %.0f / %.0f",
                                before, getShipHealth(), MAX_HEALTH)), true);
            }
            return ActionResult.SUCCESS;
        }

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
    protected Vec3d getPassengerAttachmentPos(Entity passenger, EntityDimensions dimensions, float scaleFactor) {
        // Local-space offset; vanilla applies ship yaw rotation around Y.
        // Tuned for the airship BBModel cabin: slight lift onto deck.
        return new Vec3d(0.0, 0.6, 0.0);
    }

    /**
     * Third-person camera distance while riding this ship.
     * Read by client-side {@code CameraMixin}.
     */
    public float getCameraZoom() {
        return 6.0f;
    }

    @Override
    public void tick() {
        super.tick();

        float heading = this.getYaw();
        float ts = getTargetSpeed();
        float vi = getVerticalIntent();

        // Smooth engine + vertical regardless of passenger so a recently-
        // dismounted ship coasts to a stop instead of teleport-stopping.
        // Runs both server and client side — InterpolatedFloat is deterministic
        // given the same synced inputs, so renderer reads matching values.
        enginePower.update(hasPassengers() ? ts : 0.0f);
        verticalDrive.update(hasPassengers() ? vi : 0.0f);

        // Bank roll tracks heading delta — used by renderer + camera mixin.
        float headingDelta = ((heading - lastHeading + 540f) % 360f) - 180f;
        bankRoll = bankRoll * 0.85f + headingDelta * ROLL_FACTOR * 0.15f;
        lastHeading = heading;

        // Movement is server-authoritative; client receives position updates
        // via vanilla entity tracking and interpolates locally.
        if (this.getEntityWorld().isClient()) return;

        float power = enginePower.getSmooth();
        float vert = verticalDrive.getSmooth();

        double rad = Math.toRadians(heading);
        double dx = -Math.sin(rad) * power * 0.05;
        double dz = Math.cos(rad) * power * 0.05;
        double dy = vert * 0.15;

        if (dx == 0 && dy == 0 && dz == 0) return;

        this.move(MovementType.SELF, new Vec3d(dx, dy, dz));

        if (power > 0.5f && this.getEntityWorld() instanceof net.minecraft.server.world.ServerWorld sw) {
            if (this.age % 4 == 0) {
                sw.spawnParticles(net.minecraft.particle.ParticleTypes.CAMPFIRE_COSY_SMOKE,
                        this.getX(), this.getY() + 1.0, this.getZ(),
                        1, 0.1, 0.05, 0.1, 0.01);
            }
        }
    }

    /** Current engine output (smoothed), 0..maxTargetSpeed. Read by client renderer. */
    public float getEnginePower() {
        return enginePower.getSmooth();
    }

    /** Banking roll (deg) derived from yaw rate — drives client tilt mixin. */
    public float getBankRoll() {
        return bankRoll;
    }

    @Override
    protected void initDataTracker(net.minecraft.entity.data.DataTracker.Builder builder) {
        builder.add(MODEL_NAME, "immersive_aircraft/airship");
        builder.add(SHIP_NAME, "");
        builder.add(SHIP_ID, "");
        builder.add(SHIP_HEALTH, MAX_HEALTH);
        builder.add(TARGET_SPEED, 0.0f);
        builder.add(VERTICAL_INTENT, 0.0f);
    }

    @Override
    public void readCustomData(ReadView view) {
        this.dataTracker.set(SHIP_ID, view.getString("ShipId", ""));
        this.ownerUuidStr = view.getString("OwnerUuid", "");
        setModelName(view.getString("ModelName", "immersive_aircraft/airship"));
        setShipName(view.getString("ShipName", ""));
        this.setYaw(view.getFloat("Heading", 0.0f));
        setTargetSpeed(view.getFloat("TargetSpeed", 0.0f));
        setShipHealth(view.getFloat("ShipHealth", MAX_HEALTH));
    }

    @Override
    public void writeCustomData(WriteView view) {
        view.putString("ShipId", this.dataTracker.get(SHIP_ID));
        view.putString("OwnerUuid", ownerUuidStr);
        view.putString("ModelName", getModelName());
        view.putString("ShipName", getShipName());
        view.putFloat("Heading", this.getYaw());
        view.putFloat("TargetSpeed", getTargetSpeed());
        view.putFloat("ShipHealth", getShipHealth());
    }
}
