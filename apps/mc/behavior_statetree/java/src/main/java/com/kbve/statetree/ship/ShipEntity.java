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

import java.util.ArrayList;
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
    private static final TrackedData<Float> FUEL_LEVEL =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.FLOAT);
    /** Packed upgrade list (comma-separated registry IDs) for client visibility. */
    private static final TrackedData<String> UPGRADES_CSV =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.STRING);
    /** Banner item ID (e.g. "minecraft:red_banner") for client-side rendering. */
    private static final TrackedData<String> BANNER_ITEM_ID =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.STRING);
    /**
     * Bit-packed caution flags — bit 0 PULL_UP (low altitude near ground),
     * bit 1 VOID (below world bottom), bit 2 DAMAGED (hp under 25%),
     * bit 3 LOW_FUEL (already exposed via getFuelLevel but mirrored here
     * for HUD-side parity with IA's Cautions enum).
     */
    private static final TrackedData<Byte> CAUTION_BITS =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.BYTE);

    public static final int CAUTION_PULL_UP   = 1 << 0;
    public static final int CAUTION_VOID      = 1 << 1;
    public static final int CAUTION_DAMAGED   = 1 << 2;
    public static final int CAUTION_LOW_FUEL  = 1 << 3;

    public static final float MAX_HEALTH = 100.0f;
    public static final float MAX_FUEL = 1000.0f;
    public static final float LOW_FUEL = 100.0f;
    public static final float COAL_FUEL = 200.0f;
    public static final float LAVA_FUEL = 2000.0f;

    private String ownerUuidStr = "";

    // Smoothed flight state — runs identically server + client off synced inputs.
    private final InterpolatedFloat enginePower = new InterpolatedFloat(50.0f);
    private final InterpolatedFloat verticalDrive = new InterpolatedFloat(20.0f);
    private float lastHeading = 0.0f;
    private float bankRoll = 0.0f;
    private double lastY = 0.0;
    private float inWaterLevel = 0.0f;
    private float lastEnginePowerForSound = 0.0f;

    // Cached stats — refreshed when model changes or upgrades change.
    private FlightStats statsCache = FlightStats.DEFAULT;
    private String statsCacheKey = "";
    private int upgradesHashCache = 0;

    // Backing inventory: 4 upgrade + 1 banner + 4 weapon + 16 storage slots.
    private final ShipInventory inventory = new ShipInventory(this);
    // Per-weapon-slot cooldown (ticks remaining).
    private final int[] weaponCooldowns = new int[ShipInventory.WEAPON_COUNT];

    public ShipEntity(EntityType<?> type, World world) {
        super(type, world);
        // Engine-modulated gravity is applied manually in tick(); disable
        // vanilla pull so a hovering airship doesn't sink at idle.
        this.setNoGravity(true);
    }

    public ShipInventory getInventory() { return inventory; }

    /**
     * Fire every loaded weapon slot. Each slot has its own cooldown
     * and consumes one unit of its stack per shot. Mount position is
     * a forward offset from ship origin (1.5 along heading, 0.5 up).
     */
    public void fireWeapons(net.minecraft.entity.LivingEntity pilot, float aimYaw, float aimPitch) {
        if (this.getEntityWorld().isClient()) return;
        ServerWorld sw = (ServerWorld) this.getEntityWorld();

        // Aim direction from pilot's view (so weapons follow the camera).
        double yawRad = Math.toRadians(aimYaw);
        double pitchRad = Math.toRadians(aimPitch);
        double dx = -Math.sin(yawRad) * Math.cos(pitchRad);
        double dy = -Math.sin(pitchRad);
        double dz = Math.cos(yawRad) * Math.cos(pitchRad);
        Vec3d aim = new Vec3d(dx, dy, dz).normalize();

        // Mount positions from per-aircraft JSON (ship-local). Falls back to a
        // single hardcoded forward mount if the model has none configured.
        java.util.List<Vec3d> localMounts = FlightStatsRegistry.getMounts(getModelName());

        double shipYawRad = Math.toRadians(this.getYaw());
        double cosY = Math.cos(shipYawRad);
        double sinY = Math.sin(shipYawRad);

        for (int i = 0; i < ShipInventory.WEAPON_COUNT; i++) {
            if (weaponCooldowns[i] > 0) continue;
            int slot = ShipInventory.WEAPON_START + i;
            net.minecraft.item.ItemStack stack = inventory.getStack(slot);
            if (stack.isEmpty()) continue;
            ShipWeapons.Weapon weapon = ShipWeapons.weaponFor(stack.getItem());
            if (weapon == null) continue;

            // Resolve mount: pick i-th JSON mount if available, else cycle.
            Vec3d local;
            if (!localMounts.isEmpty()) {
                local = localMounts.get(i % localMounts.size());
            } else {
                local = new Vec3d(0.0, 0.6, 1.5);
            }
            // Rotate ship-local mount around Y by ship yaw.
            double wx = this.getX() + local.x * cosY - local.z * sinY;
            double wy = this.getY() + local.y;
            double wz = this.getZ() + local.x * sinY + local.z * cosY;
            Vec3d origin = new Vec3d(wx, wy, wz);

            weapon.fire(sw, this, pilot, origin, aim);
            stack.decrement(1);
            if (stack.isEmpty()) inventory.setStack(slot, net.minecraft.item.ItemStack.EMPTY);
            weaponCooldowns[i] = ShipWeapons.FIRE_COOLDOWN;
        }
    }

    private String getDisplayLabel() {
        String n = getShipName();
        return n.isEmpty() ? "Ship" : n;
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

    public float getFuelLevel() { return this.dataTracker.get(FUEL_LEVEL); }
    public void setFuelLevel(float fuel) {
        this.dataTracker.set(FUEL_LEVEL, MathHelper.clamp(fuel, 0f, MAX_FUEL));
    }
    public boolean isFuelLow() { return getFuelLevel() < LOW_FUEL; }

    public float getEnginePower() { return enginePower.getSmooth(); }
    public float getBankRoll() { return bankRoll; }
    public float getCameraZoom() { return getStats().cameraZoom(); }

    /** Bit-packed caution flags — see CAUTION_* constants. Read by HUD. */
    public byte getCautionBits() { return this.dataTracker.get(CAUTION_BITS); }
    public boolean hasCaution(int mask) { return (getCautionBits() & mask) != 0; }

    public FlightStats getStats() {
        String key = getModelName();
        List<net.minecraft.item.Item> installed = installedUpgrades();
        int upgradesHash = installed.hashCode();
        if (!key.equals(statsCacheKey) || upgradesHash != upgradesHashCache) {
            FlightStats base = FlightStatsRegistry.get(key);
            statsCache = installed.isEmpty() ? base : ShipUpgrades.apply(base, installed);
            statsCacheKey = key;
            upgradesHashCache = upgradesHash;
            enginePower.setSteps(statsCache.engineReaction());
            verticalDrive.setSteps(statsCache.verticalReaction());
        }
        return statsCache;
    }

    private List<net.minecraft.item.Item> installedUpgrades() {
        List<net.minecraft.item.Item> out = new ArrayList<>(ShipInventory.UPGRADE_COUNT);
        for (int i = 0; i < ShipInventory.UPGRADE_COUNT; i++) {
            net.minecraft.item.ItemStack s = inventory.getStack(ShipInventory.UPGRADE_START + i);
            if (!s.isEmpty() && ShipUpgrades.isUpgrade(s.getItem())) out.add(s.getItem());
        }
        return out;
    }

    /** Number of installed upgrades — client reads via TrackedData. */
    public int getUpgradeCount() {
        String csv = this.dataTracker.get(UPGRADES_CSV);
        if (csv.isEmpty()) return 0;
        int count = 1;
        for (int i = 0; i < csv.length(); i++) if (csv.charAt(i) == ',') count++;
        return count;
    }

    /** Comma-separated installed upgrade registry IDs (synced to client). */
    public String getUpgradesCsv() {
        return this.dataTracker.get(UPGRADES_CSV);
    }

    /** Called by ShipInventory.markDirty after any slot change. */
    public void onInventoryChanged() {
        upgradesHashCache = -1; // force getStats() recompute
        if (!this.getEntityWorld().isClient()) {
            syncUpgradesCsv();
            syncBannerId();
        }
    }

    private void syncBannerId() {
        net.minecraft.item.ItemStack banner = inventory.getBanner();
        String id = banner.isEmpty()
                ? ""
                : net.minecraft.registry.Registries.ITEM.getId(banner.getItem()).toString();
        this.dataTracker.set(BANNER_ITEM_ID, id);
    }

    /** Item ID of the installed banner (or empty). Read by client renderer. */
    public String getBannerItemId() {
        return this.dataTracker.get(BANNER_ITEM_ID);
    }

    private void syncUpgradesCsv() {
        List<net.minecraft.item.Item> installed = installedUpgrades();
        StringBuilder packed = new StringBuilder();
        for (int i = 0; i < installed.size(); i++) {
            if (i > 0) packed.append(',');
            packed.append(net.minecraft.registry.Registries.ITEM.getId(installed.get(i)).toString());
        }
        this.dataTracker.set(UPGRADES_CSV, packed.toString());
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
        // Drop entire inventory (upgrades + banner + weapons + cargo) for salvage.
        for (int i = 0; i < inventory.size(); i++) {
            net.minecraft.item.ItemStack s = inventory.getStack(i);
            if (!s.isEmpty()) this.dropStack(world, s);
        }
        inventory.clear();
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
        net.minecraft.item.ItemStack stack = player.getStackInHand(hand);

        // Sneak + empty hand → open ship inventory GUI.
        if (player.isSneaking() && stack.isEmpty()) {
            if (player instanceof ServerPlayerEntity sp) {
                sp.openHandledScreen(new net.minecraft.screen.SimpleNamedScreenHandlerFactory(
                        (syncId, playerInv, p) -> new ShipScreenHandler(syncId, playerInv, inventory),
                        net.minecraft.text.Text.literal(getDisplayLabel())
                ));
            }
            return ActionResult.SUCCESS;
        }
        // Sneak + upgrade item → quick-install into first free upgrade slot.
        if (player.isSneaking() && ShipUpgrades.isUpgrade(stack.getItem())) {
            for (int i = 0; i < ShipInventory.UPGRADE_COUNT; i++) {
                int idx = ShipInventory.UPGRADE_START + i;
                if (inventory.getStack(idx).isEmpty()) {
                    inventory.setStack(idx, new net.minecraft.item.ItemStack(stack.getItem()));
                    if (!player.getAbilities().creativeMode) stack.decrement(1);
                    return ActionResult.SUCCESS;
                }
            }
            if (!this.getEntityWorld().isClient()) {
                player.sendMessage(net.minecraft.text.Text.of(
                        "Upgrade slots full"), true);
            }
            return ActionResult.PASS;
        }
        // Sneak + weapon item → quick-install into first free weapon slot.
        if (player.isSneaking() && ShipWeapons.isWeapon(stack.getItem())) {
            for (int i = 0; i < ShipInventory.WEAPON_COUNT; i++) {
                int idx = ShipInventory.WEAPON_START + i;
                if (inventory.getStack(idx).isEmpty()) {
                    net.minecraft.item.ItemStack copy = stack.copy();
                    if (!player.getAbilities().creativeMode) {
                        stack.setCount(0);
                    }
                    inventory.setStack(idx, copy);
                    return ActionResult.SUCCESS;
                }
            }
            return ActionResult.PASS;
        }

        // Repair: iron ingot → +25 HP per ingot.
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

        // Refuel: coal → +200 fuel; lava bucket → +2000 fuel (consumes bucket).
        if (getFuelLevel() < MAX_FUEL) {
            float before = getFuelLevel();
            float added = 0f;
            if (stack.isOf(net.minecraft.item.Items.COAL) || stack.isOf(net.minecraft.item.Items.CHARCOAL)) {
                added = COAL_FUEL;
                if (!player.getAbilities().creativeMode) stack.decrement(1);
            } else if (stack.isOf(net.minecraft.item.Items.COAL_BLOCK)) {
                added = COAL_FUEL * 9f;
                if (!player.getAbilities().creativeMode) stack.decrement(1);
            } else if (stack.isOf(net.minecraft.item.Items.LAVA_BUCKET)) {
                added = LAVA_FUEL;
                if (!player.getAbilities().creativeMode) {
                    player.setStackInHand(hand,
                            new net.minecraft.item.ItemStack(net.minecraft.item.Items.BUCKET));
                }
            }
            if (added > 0f) {
                setFuelLevel(before + added);
                if (!this.getEntityWorld().isClient()) {
                    player.sendMessage(net.minecraft.text.Text.of(
                            String.format("Fueled: %.0f → %.0f / %.0f",
                                    before, getFuelLevel(), MAX_FUEL)), true);
                }
                return ActionResult.SUCCESS;
            }
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
        boolean fueled = getFuelLevel() > 0f;

        // Auto-cut throttle when out of fuel.
        if (!fueled) ts = 0f;
        enginePower.update(ridden && fueled ? ts : 0.0f);
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

        // Decrement weapon cooldowns each tick.
        for (int i = 0; i < weaponCooldowns.length; i++) {
            if (weaponCooldowns[i] > 0) weaponCooldowns[i]--;
        }

        float power = enginePower.getSmooth();
        float vert = verticalDrive.getSmooth();

        // Burn fuel proportional to engine output. Idle = no consumption.
        if (power > 0.01f && fueled) {
            float burn = power * stats.engineSpeed() * 2.0f;
            setFuelLevel(getFuelLevel() - burn);
        }

        // Boiler feed — top off fuel from the dedicated feed slot when low.
        // Consumes one item per top-off; lava buckets leave an empty bucket.
        if (getFuelLevel() < MAX_FUEL - COAL_FUEL) {
            net.minecraft.item.ItemStack feed = inventory.getStack(ShipInventory.FUEL_SLOT);
            if (!feed.isEmpty()) {
                float bonus = 0f;
                boolean isLava = false;
                if (feed.isOf(net.minecraft.item.Items.COAL)
                        || feed.isOf(net.minecraft.item.Items.CHARCOAL)) {
                    bonus = COAL_FUEL;
                } else if (feed.isOf(net.minecraft.item.Items.COAL_BLOCK)) {
                    bonus = COAL_FUEL * 9f;
                } else if (feed.isOf(net.minecraft.item.Items.LAVA_BUCKET)) {
                    bonus = LAVA_FUEL;
                    isLava = true;
                }
                if (bonus > 0f) {
                    setFuelLevel(getFuelLevel() + bonus);
                    if (isLava) {
                        inventory.setStack(ShipInventory.FUEL_SLOT,
                                new net.minecraft.item.ItemStack(net.minecraft.item.Items.BUCKET));
                    } else {
                        feed.decrement(1);
                    }
                }
            }
        }

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

        // Caution flags — refreshed every tick, synced via TrackedData byte.
        int caution = 0;
        ServerWorld sworld = (ServerWorld) this.getEntityWorld();
        // PULL_UP: descending fast and within 6 blocks of the next solid block below.
        if (vel.y < -0.15) {
            int floorY = sworld.getTopY(net.minecraft.world.Heightmap.Type.MOTION_BLOCKING,
                    (int) Math.floor(this.getX()), (int) Math.floor(this.getZ()));
            if (this.getY() - floorY < 6.0) caution |= CAUTION_PULL_UP;
        }
        // VOID: under the world bottom.
        if (this.getY() < sworld.getBottomY() + 4) caution |= CAUTION_VOID;
        // DAMAGED: hp below 25%.
        if (getShipHealth() < MAX_HEALTH * 0.25f) caution |= CAUTION_DAMAGED;
        // LOW_FUEL: fuel below threshold.
        if (isFuelLow()) caution |= CAUTION_LOW_FUEL;
        if (caution != getCautionBits()) {
            this.dataTracker.set(CAUTION_BITS, (byte) caution);
        }

        this.setVelocity(vel);
        if (vel.lengthSquared() > 1.0e-6) {
            this.move(MovementType.SELF, vel);
        }

        // Particle trail — per-aircraft visual style.
        if (power > 0.3f && this.getEntityWorld() instanceof ServerWorld sw) {
            spawnTrailParticles(sw, power);
        }

        // Boost speed-lines — perpendicular cloud streaks while throttle
        // exceeds normal max (sprint key bumps maxThrottle to 1.5). Mirrors
        // IA's high-speed visual flourish.
        if (power > 1.0f && this.getEntityWorld() instanceof ServerWorld swBoost
                && this.age % 2 == 0) {
            double radB = Math.toRadians(this.getYaw());
            double sx = Math.cos(radB) * 0.8;
            double sz = Math.sin(radB) * 0.8;
            for (int i = 0; i < 2; i++) {
                double sign = i == 0 ? 1.0 : -1.0;
                swBoost.spawnParticles(net.minecraft.particle.ParticleTypes.CLOUD,
                        this.getX() + sx * sign,
                        this.getY() + 0.3,
                        this.getZ() + sz * sign,
                        1, 0.0, 0.0, 0.0, 0.05);
            }
        }

        // Banner color plume — independent of throttle so a parked ship
        // still flies its colors.
        if (this.getEntityWorld() instanceof ServerWorld sw3) {
            spawnBannerParticles(sw3);
        }

        // Engine sound — pitch scales with throttle. Cadence speeds up as
        // power rises so the audio gets more frantic at full thrust.
        if (this.getEntityWorld() instanceof ServerWorld sw2) {
            net.minecraft.sound.SoundEvent loopSound = resolveEngineSound(stats.engineSound());
            // Engine spinup — distinct one-shot + visible smoke burst.
            if (lastEnginePowerForSound < 0.05f && power >= 0.05f) {
                sw2.playSound(null, this.getX(), this.getY(), this.getZ(),
                        net.minecraft.sound.SoundEvents.ITEM_FLINTANDSTEEL_USE,
                        net.minecraft.sound.SoundCategory.NEUTRAL,
                        0.6f, 0.8f);
                sw2.spawnParticles(net.minecraft.particle.ParticleTypes.LARGE_SMOKE,
                        this.getX(), this.getY() + 0.6, this.getZ(),
                        12, 0.5, 0.2, 0.5, 0.04);
            }
            // Engine shutdown — soft puff when throttle drops to zero.
            if (lastEnginePowerForSound >= 0.05f && power < 0.05f) {
                sw2.playSound(null, this.getX(), this.getY(), this.getZ(),
                        net.minecraft.sound.SoundEvents.BLOCK_FIRE_EXTINGUISH,
                        net.minecraft.sound.SoundCategory.NEUTRAL,
                        0.4f, 1.0f);
            }
            // Engine loop — periodic rumble while running, sound from stats.
            if (power > 0.05f && loopSound != null) {
                int cadence = Math.max(2, (int) (12 - 8 * power));
                if (this.age % cadence == 0) {
                    float pitch = 0.5f + 0.7f * power;
                    sw2.playSound(null, this.getX(), this.getY(), this.getZ(),
                            loopSound,
                            net.minecraft.sound.SoundCategory.NEUTRAL,
                            0.35f + 0.3f * power, pitch);
                }
            }
            lastEnginePowerForSound = power;
        }
    }

    /** Resolve a SoundEvent by registry ID. Falls back to minecart riding. */
    private static net.minecraft.sound.SoundEvent resolveEngineSound(String id) {
        if (id == null || id.isEmpty()) {
            return net.minecraft.sound.SoundEvents.ENTITY_MINECART_RIDING;
        }
        net.minecraft.util.Identifier soundId = net.minecraft.util.Identifier.tryParse(id);
        if (soundId == null) return net.minecraft.sound.SoundEvents.ENTITY_MINECART_RIDING;
        net.minecraft.sound.SoundEvent ev = net.minecraft.registry.Registries.SOUND_EVENT.get(soundId);
        return ev != null ? ev : net.minecraft.sound.SoundEvents.ENTITY_MINECART_RIDING;
    }

    private static Vec3d lerp(Vec3d a, Vec3d b, double t) {
        return new Vec3d(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    }

    /**
     * Spawn banner-color dust above the ship as a visual flag. We can't
     * easily inject custom geometry into the BBModel render queue in
     * 1.21.11, so the installed banner advertises itself as a colored
     * particle plume instead. Mirrors IA's banner indicator without
     * needing pattern-aware mesh rendering.
     */
    private void spawnBannerParticles(ServerWorld sw) {
        String bannerId = getBannerItemId();
        if (bannerId.isEmpty() || this.age % 6 != 0) return;
        int color = bannerColor(bannerId);
        if (color < 0) return;
        net.minecraft.particle.DustParticleEffect dust =
                new net.minecraft.particle.DustParticleEffect(color, 1.4f);
        // Two puffs offset along ship roll axis to suggest a flag waving.
        double rad = Math.toRadians(this.getYaw());
        double sx = Math.cos(rad) * 0.4;
        double sz = Math.sin(rad) * 0.4;
        sw.spawnParticles(dust,
                this.getX() + sx, this.getY() + 2.2, this.getZ() + sz,
                1, 0.05, 0.05, 0.05, 0.0);
        sw.spawnParticles(dust,
                this.getX() - sx, this.getY() + 2.4, this.getZ() - sz,
                1, 0.05, 0.05, 0.05, 0.0);
    }

    /** Map a vanilla banner item ID to its base color (RGB int). -1 if not a banner. */
    private static int bannerColor(String id) {
        return switch (id) {
            case "minecraft:white_banner"      -> 0xF9FFFE;
            case "minecraft:orange_banner"     -> 0xF9801D;
            case "minecraft:magenta_banner"    -> 0xC74EBD;
            case "minecraft:light_blue_banner" -> 0x3AB3DA;
            case "minecraft:yellow_banner"     -> 0xFED83D;
            case "minecraft:lime_banner"       -> 0x80C71F;
            case "minecraft:pink_banner"       -> 0xF38BAA;
            case "minecraft:gray_banner"       -> 0x474F52;
            case "minecraft:light_gray_banner" -> 0x9D9D97;
            case "minecraft:cyan_banner"       -> 0x169C9C;
            case "minecraft:purple_banner"     -> 0x8932B8;
            case "minecraft:blue_banner"       -> 0x3C44AA;
            case "minecraft:brown_banner"      -> 0x835432;
            case "minecraft:green_banner"      -> 0x5E7C16;
            case "minecraft:red_banner"        -> 0xB02E26;
            case "minecraft:black_banner"      -> 0x1D1D21;
            default -> -1;
        };
    }

    /**
     * Per-aircraft trail effect (server-side spawn so all clients see it).
     * Particle type comes from stats.trailParticle when set; spawn position
     * is still chosen per-model (wing-tip / rotor wash / aft exhaust)
     * since IA's TrailDescriptor JSON shape isn't ported.
     */
    private void spawnTrailParticles(ServerWorld sw, float power) {
        String model = getModelName();
        FlightStats stats = getStats();
        net.minecraft.particle.ParticleEffect particle = resolveTrailParticle(stats.trailParticle(), model);
        if (particle == null) return;

        double rad = Math.toRadians(this.getYaw());
        if (model.contains("biplane")) {
            if (this.age % 2 == 0) {
                double wx = Math.cos(rad) * 1.4;
                double wz = Math.sin(rad) * 1.4;
                sw.spawnParticles(particle,
                        this.getX() + wx, this.getY() + 0.3, this.getZ() + wz,
                        1, 0.0, 0.0, 0.0, 0.0);
                sw.spawnParticles(particle,
                        this.getX() - wx, this.getY() + 0.3, this.getZ() - wz,
                        1, 0.0, 0.0, 0.0, 0.0);
            }
        } else if (model.contains("gyrodyne")) {
            if (this.age % 3 == 0) {
                sw.spawnParticles(particle,
                        this.getX(), this.getY() - 0.3, this.getZ(),
                        2, 0.4, 0.1, 0.4, 0.02);
            }
        } else {
            if (this.age % 4 == 0) {
                double behindX = this.getX() - (-Math.sin(rad)) * 1.2;
                double behindZ = this.getZ() - Math.cos(rad) * 1.2;
                sw.spawnParticles(particle,
                        behindX, this.getY() + 0.5, behindZ,
                        1, 0.1, 0.05, 0.1, 0.01);
            }
        }
    }

    private static net.minecraft.particle.ParticleEffect resolveTrailParticle(String id, String model) {
        if (id != null && !id.isEmpty()) {
            net.minecraft.util.Identifier pid = net.minecraft.util.Identifier.tryParse(id);
            if (pid != null) {
                net.minecraft.particle.ParticleType<?> pt =
                        net.minecraft.registry.Registries.PARTICLE_TYPE.get(pid);
                if (pt instanceof net.minecraft.particle.ParticleEffect pe) return pe;
            }
        }
        if (model.contains("biplane")) return net.minecraft.particle.ParticleTypes.CLOUD;
        if (model.contains("gyrodyne")) return net.minecraft.particle.ParticleTypes.SMOKE;
        return net.minecraft.particle.ParticleTypes.CAMPFIRE_COSY_SMOKE;
    }

    /**
     * Granted to riders dismounting at altitude so they don't take fall
     * damage from a long drop. Mirrors the courtesy IA's vehicles extend.
     */
    @Override
    protected void removePassenger(Entity passenger) {
        super.removePassenger(passenger);
        if (this.getEntityWorld().isClient()) return;
        if (!(passenger instanceof net.minecraft.entity.LivingEntity living)) return;
        ServerWorld sw = (ServerWorld) this.getEntityWorld();
        int floorY = sw.getTopY(net.minecraft.world.Heightmap.Type.MOTION_BLOCKING,
                (int) Math.floor(living.getX()), (int) Math.floor(living.getZ()));
        double altitude = living.getY() - floorY;
        if (altitude > 5.0) {
            living.addStatusEffect(new net.minecraft.entity.effect.StatusEffectInstance(
                    net.minecraft.entity.effect.StatusEffects.SLOW_FALLING,
                    200, 0, false, false, true));
        }
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
        builder.add(FUEL_LEVEL, MAX_FUEL);
        builder.add(UPGRADES_CSV, "");
        builder.add(BANNER_ITEM_ID, "");
        builder.add(CAUTION_BITS, (byte) 0);
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
        setFuelLevel(view.getFloat("FuelLevel", MAX_FUEL));

        // Inventory: full ItemStack codec preserves components (enchantments,
        // banner patterns, custom names, durability) across world reload.
        for (int i = 0; i < inventory.size(); i++) inventory.setStack(i, net.minecraft.item.ItemStack.EMPTY);
        view.read("Inventory",
                com.mojang.serialization.Codec.list(net.minecraft.item.ItemStack.OPTIONAL_CODEC))
                .ifPresent(list -> {
                    for (int i = 0; i < list.size() && i < inventory.size(); i++) {
                        inventory.setStack(i, list.get(i));
                    }
                });
        upgradesHashCache = -1;
        syncUpgradesCsv();
        syncBannerId();
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
        view.putFloat("FuelLevel", getFuelLevel());

        java.util.List<net.minecraft.item.ItemStack> stacks =
                new java.util.ArrayList<>(inventory.size());
        for (int i = 0; i < inventory.size(); i++) {
            stacks.add(inventory.getStack(i));
        }
        view.put("Inventory",
                com.mojang.serialization.Codec.list(net.minecraft.item.ItemStack.OPTIONAL_CODEC),
                stacks);
    }
}
