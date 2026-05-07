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
import net.minecraft.server.world.ServerWorld;
import net.minecraft.storage.ReadView;
import net.minecraft.storage.WriteView;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import net.minecraft.world.explosion.Explosion;

import java.util.List;
import java.util.UUID;

/**
 * Entity-based ship (airship / biplane / gyrodyne) rendered via BBModel.
 * Flight tuning is per-model via {@link FlightStatsRegistry}; physics
 * pipeline mirrors ImmersiveAircraft's AircraftEntity / Rotorcraft.
 */
public class ShipEntity extends Entity {

    // Tracked data syncs to clients via vanilla entity tracking.
    private static final TrackedData<String> MODEL_NAME =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.STRING);
    private static final TrackedData<String> SHIP_NAME =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.STRING);
    private static final TrackedData<String> SHIP_ID =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.STRING);
    private static final TrackedData<Float> SHIP_HEALTH =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.FLOAT);
    private static final TrackedData<Float> TARGET_SPEED =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.FLOAT);
    private static final TrackedData<Float> VERTICAL_INTENT =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.FLOAT);

    public static final float MAX_HEALTH = 100.0f;

    private String ownerUuidStr = "";

    // Smoothed flight state — runs identically server + client off synced inputs.
    private final InterpolatedFloat enginePower = new InterpolatedFloat(50.0f);
    private final InterpolatedFloat verticalDrive = new InterpolatedFloat(20.0f);
    private float lastHeading = 0.0f;
    private float bankRoll = 0.0f;
    private double lastY = 0.0;
    private float inWaterLevel = 0.0f;

    // Cached stats — refreshed when model changes.
    private FlightStats statsCache = FlightStats.DEFAULT;
    private String statsCacheKey = "";

    public ShipEntity(EntityType<?> type, World world) {
        super(type, world);
        // Engine-modulated gravity is applied manually in tick(); disable
        // vanilla pull so a hovering airship doesn't sink at idle.
        this.setNoGravity(true);
    }

    // -- Accessors ----------------------------------------------------------

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
    public void setHeading(float heading) { this.setYaw(heading % 360f); }

    public float getTargetSpeed() { return this.dataTracker.get(TARGET_SPEED); }
    public void setTargetSpeed(float speed) {
        this.dataTracker.set(TARGET_SPEED, MathHelper.clamp(speed, 0f, 2.0f));
    }

    public float getVerticalIntent() { return this.dataTracker.get(VERTICAL_INTENT); }
    public void setVerticalIntent(float v) {
        this.dataTracker.set(VERTICAL_INTENT, MathHelper.clamp(v, -1f, 1f));
    }

    public float getShipHealth() { return this.dataTracker.get(SHIP_HEALTH); }
    public void setShipHealth(float hp) {
        this.dataTracker.set(SHIP_HEALTH, MathHelper.clamp(hp, 0f, MAX_HEALTH));
    }

    public float getEnginePower() { return enginePower.getSmooth(); }
    public float getBankRoll() { return bankRoll; }
    public float getCameraZoom() { return getStats().cameraZoom(); }

    public FlightStats getStats() {
        String key = getModelName();
        if (!key.equals(statsCacheKey)) {
            statsCache = FlightStatsRegistry.get(key);
            statsCacheKey = key;
            // Refresh smoothing reaction times for the new profile.
            enginePower.setSteps(statsCache.engineReaction());
            verticalDrive.setSteps(statsCache.verticalReaction());
        }
        return statsCache;
    }

    // -- Damage / interact --------------------------------------------------

    @Override
    public boolean damage(ServerWorld world,
                          net.minecraft.entity.damage.DamageSource source,
                          float amount) {
        if (this.isRemoved()) return false;
        if (source.isIn(net.minecraft.registry.tag.DamageTypeTags.IS_FIRE)) return false;
        if (source.isIn(net.minecraft.registry.tag.DamageTypeTags.IS_FALL)) return false;

        float newHp = getShipHealth() - amount;
        setShipHealth(newHp);
        if (newHp <= 0f) {
            destroyAndExplode(world);
        }
        return true;
    }

    private void destroyAndExplode(ServerWorld world) {
        if (getStats().canExplodeOnCrash()) {
            world.createExplosion(this, this.getX(), this.getY(), this.getZ(),
                    2.5f, World.ExplosionSourceType.MOB);
        }
        this.removeAllPassengers();
        this.discard();
    }

    @Override
    public boolean isCollidable(Entity other) { return true; }

    @Override
    public boolean canHit() { return true; }

    @Override
    public EntityDimensions getDimensions(net.minecraft.entity.EntityPose pose) {
        FlightStats s = getStats();
        return EntityDimensions.changing(s.boundingWidth(), s.boundingHeight());
    }

    @Override
    public ActionResult interact(PlayerEntity player, Hand hand) {
        if (player.isSneaking()) return ActionResult.PASS;

        net.minecraft.item.ItemStack stack = player.getStackInHand(hand);
        if (stack.isOf(net.minecraft.item.Items.IRON_INGOT) && getShipHealth() < MAX_HEALTH) {
            float before = getShipHealth();
            setShipHealth(before + 25.0f);
            if (!player.getAbilities().creativeMode) stack.decrement(1);
            if (!this.getEntityWorld().isClient()) {
                player.sendMessage(net.minecraft.text.Text.of(
                        String.format("Ship repaired: %.0f → %.0f / %.0f",
                                before, getShipHealth(), MAX_HEALTH)), true);
            }
            return ActionResult.SUCCESS;
        }

        if (player instanceof ServerPlayerEntity && this.getPassengerList().size() < seatCapacity()) {
            player.startRiding(this);
            return ActionResult.SUCCESS;
        }
        return ActionResult.PASS;
    }

    private int seatCapacity() {
        List<List<Vec3d>> seats = FlightStatsRegistry.getSeats(getModelName());
        return seats.isEmpty() ? 1 : seats.get(seats.size() - 1).size();
    }

    @Override
    protected boolean canAddPassenger(Entity passenger) {
        return this.getPassengerList().size() < seatCapacity() && passenger instanceof PlayerEntity;
    }

    // -- Multi-passenger seating -------------------------------------------

    @Override
    protected Vec3d getPassengerAttachmentPos(Entity passenger,
                                              EntityDimensions dimensions,
                                              float scaleFactor) {
        // Find seat for this passenger from stats.seats[count-1][index].
        List<Entity> riders = this.getPassengerList();
        List<List<Vec3d>> seatRows = FlightStatsRegistry.getSeats(getModelName());
        int count = riders.size();
        if (count == 0 || seatRows.isEmpty()) return new Vec3d(0.0, 0.6, 0.0);

        int rowIdx = Math.min(count - 1, seatRows.size() - 1);
        List<Vec3d> row = seatRows.get(rowIdx);
        if (row.isEmpty()) return new Vec3d(0.0, 0.6, 0.0);

        int idx = riders.indexOf(passenger);
        if (idx < 0 || idx >= row.size()) idx = 0;
        return row.get(idx);
    }

    // -- Tick ---------------------------------------------------------------

    @Override
    public void tick() {
        super.tick();

        FlightStats stats = getStats();
        float heading = this.getYaw();
        float ts = getTargetSpeed();
        float vi = getVerticalIntent();
        boolean ridden = hasPassengers();

        enginePower.update(ridden ? ts : 0.0f);
        verticalDrive.update(ridden ? vi : 0.0f);

        // Bank roll from yaw delta — smoothed, used by renderer + camera.
        float headingDelta = ((heading - lastHeading + 540f) % 360f) - 180f;
        bankRoll = bankRoll * 0.85f + headingDelta * stats.rollFactor() * 0.15f;
        lastHeading = heading;

        // Track whether we're touching water for dampening.
        if (this.isTouchingWater()) {
            inWaterLevel = Math.min(1.0f, inWaterLevel + 0.05f);
        } else {
            inWaterLevel = Math.max(0.0f, inWaterLevel - 0.05f);
        }

        if (this.getEntityWorld().isClient()) return;

        float power = enginePower.getSmooth();
        float vert = verticalDrive.getSmooth();

        // Forward direction in horizontal plane (rotorcraft style).
        double rad = Math.toRadians(heading);
        double fx = -Math.sin(rad);
        double fz = Math.cos(rad);

        Vec3d vel = this.getVelocity();

        // Forward thrust scaled by engineSpeed. No quintic curve — linear power.
        double thrustScale = power * stats.engineSpeed() * (1.0f - inWaterLevel * 0.5f);
        vel = vel.add(fx * thrustScale, 0.0, fz * thrustScale);

        // Vertical thrust (rotorcraft) — pitchSpeed > 0 means plane (uses pitch instead).
        if (stats.pitchSpeed() <= 0.0f) {
            vel = vel.add(0.0, vert * power * stats.verticalSpeed(), 0.0);
        } else {
            // Plane — input drives pitch; pitch + forward velocity yields lift.
            float pitch = this.getPitch();
            pitch += stats.pitchSpeed() * vert;
            pitch *= (1.0f - stats.stabilizer());
            this.setPitch(MathHelper.clamp(pitch, -90.0f, 90.0f));

            // Glide: forward thrust on descent.
            if (stats.glideFactor() > 0.0f) {
                double dy = lastY - this.getY();
                if (lastY != 0.0 && dy != 0.0) {
                    double glide = dy * stats.glideFactor();
                    vel = vel.add(fx * glide, 0.0, fz * glide);
                }
            }
        }
        lastY = this.getY();

        // Drag/lift — lerp horizontal velocity toward heading.
        Vec3d horiz = new Vec3d(vel.x, 0, vel.z);
        double speed = horiz.length();
        if (speed > 1.0e-4) {
            Vec3d dir = horiz.normalize();
            Vec3d forward = new Vec3d(fx, 0, fz);
            double drag = Math.abs(forward.dotProduct(dir));
            Vec3d blended = lerp(dir, forward, stats.lift());
            double frictionScale = drag * stats.horizontalDecay() + (1.0 - stats.horizontalDecay());
            blended = blended.multiply(speed * frictionScale);
            vel = new Vec3d(blended.x, vel.y * stats.verticalDecay(), blended.z);
        } else {
            vel = new Vec3d(vel.x, vel.y * stats.verticalDecay(), vel.z);
        }

        // Engine-modulated gravity — full power = hover, off = fall.
        double gravity = -0.04 * (1.0 - power);
        vel = vel.add(0.0, gravity, 0.0);

        // Wind perturbation — cosNoise-style ambient drift.
        if (stats.wind() > 0.0f && !this.isOnGround() && inWaterLevel < 0.5f) {
            ServerWorld sw = (ServerWorld) this.getEntityWorld();
            float windStrength = stats.wind()
                    * (sw.isRaining() ? 1.8f : 1.0f)
                    * (sw.isThundering() ? 2.2f : 1.0f);
            float nx = (float) Math.cos(this.age / 20.0 / stats.mass()) * windStrength;
            float nz = (float) Math.cos(this.age / 21.0 / stats.mass()) * windStrength;
            vel = vel.add(nx * 0.005, 0.0, nz * 0.005);
        }

        // Ground-pitch settle (planes only).
        if (this.isOnGround() && stats.pitchSpeed() > 0.0f) {
            float p = this.getPitch();
            this.setPitch((p + stats.groundPitch()) * 0.9f - stats.groundPitch());
            // Ground friction.
            vel = vel.multiply(stats.groundFriction(), 1.0, stats.groundFriction());
        }

        // Crash explosion — impact when hard-landing with significant downward velocity.
        if (stats.canExplodeOnCrash() && this.isOnGround()) {
            double impact = -vel.y;
            if (impact > 1.5) {
                destroyAndExplode((ServerWorld) this.getEntityWorld());
                return;
            }
        }

        this.setVelocity(vel);
        if (vel.lengthSquared() > 1.0e-6) {
            this.move(MovementType.SELF, vel);
        }

        // Particle smoke trail — engine running + above min throttle.
        if (power > 0.5f && this.age % 4 == 0
                && this.getEntityWorld() instanceof ServerWorld sw) {
            sw.spawnParticles(net.minecraft.particle.ParticleTypes.CAMPFIRE_COSY_SMOKE,
                    this.getX(), this.getY() + 1.0, this.getZ(),
                    1, 0.1, 0.05, 0.1, 0.01);
        }
    }

    private static Vec3d lerp(Vec3d a, Vec3d b, double t) {
        return new Vec3d(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    }

    // -- Dismount safety ---------------------------------------------------

    @Override
    public Vec3d updatePassengerForDismount(net.minecraft.entity.LivingEntity passenger) {
        // Try a few horizontal offsets at ship height; default to ship pos.
        double radius = Math.max(getStats().boundingWidth(), 1.5);
        double yawRad = Math.toRadians(this.getYaw());
        Vec3d[] candidates = new Vec3d[]{
                new Vec3d(this.getX() + Math.cos(yawRad) * radius,
                        this.getY(),
                        this.getZ() + Math.sin(yawRad) * radius),
                new Vec3d(this.getX() - Math.cos(yawRad) * radius,
                        this.getY(),
                        this.getZ() - Math.sin(yawRad) * radius),
                new Vec3d(this.getX() + radius, this.getY(), this.getZ()),
                new Vec3d(this.getX() - radius, this.getY(), this.getZ()),
        };
        for (Vec3d c : candidates) {
            if (this.getEntityWorld().isSpaceEmpty(passenger, passenger.getBoundingBox().offset(
                    c.x - passenger.getX(), c.y - passenger.getY(), c.z - passenger.getZ()))) {
                return c;
            }
        }
        return super.updatePassengerForDismount(passenger);
    }

    // -- DataTracker / NBT --------------------------------------------------

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
        this.setPitch(view.getFloat("Pitch", 0.0f));
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
        view.putFloat("Pitch", this.getPitch());
        view.putFloat("TargetSpeed", getTargetSpeed());
        view.putFloat("ShipHealth", getShipHealth());
    }
}
