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

    private static final TrackedData<String> MODEL_NAME =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.STRING);
    private static final TrackedData<String> SHIP_NAME =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.STRING);
    private static final TrackedData<String> SHIP_ID =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.STRING);
    private static final TrackedData<String> OWNER_NAME =
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
    /** Boost meter 0..1 — drains while sprinting at >1.0 throttle, regens otherwise. */
    private static final TrackedData<Float> BOOST_RESERVE =
            DataTracker.registerData(ShipEntity.class, TrackedDataHandlerRegistry.FLOAT);

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

    private final InterpolatedFloat enginePower = new InterpolatedFloat(50.0f);
    private final InterpolatedFloat verticalDrive = new InterpolatedFloat(20.0f);
    private float lastHeading = 0.0f;
    private float bankRoll = 0.0f;
    private double lastY = 0.0;
    private float inWaterLevel = 0.0f;
    private float lastEnginePowerForSound = 0.0f;
    /** Previous tick's caution bits — used to fire one-shot warning sounds on transition. */
    private byte lastCautionBitsForSound = 0;
    private boolean lastOnGroundForDust = true;
    private int autoParkHoverTicks = 0;

    private FlightStats statsCache = FlightStats.DEFAULT;
    private String statsCacheKey = "";
    private int upgradesHashCache = 0;

    private final ShipInventory inventory = new ShipInventory(this);
    private final int[] weaponCooldowns = new int[ShipInventory.WEAPON_COUNT];

    public ShipEntity(EntityType<?> type, World world) {
        super(type, world);
        this.setNoGravity(true);
    }

    public ShipInventory getInventory() { return inventory; }

    /** Owner UUID match OR creative-mode op-level-2 admin (vanilla check). */
    private boolean ownerOrOpCanModify(PlayerEntity player) {
        UUID owner = getOwnerUuid();
        if (owner == null || owner.equals(player.getUuid())) return true;
        return player.isCreativeLevelTwoOp();
    }

    /**
     * Pack this ship back into an inventory item carrying its name, HP,
     * and fuel. Drops cargo + banner + weapon + upgrade slots at the
     * ship position so the player can collect and re-install. Returns
     * the resulting ItemStack to the player's inventory (or drops it
     * if their inventory is full).
     */
    public void pickupAsItem(PlayerEntity player) {
        if (this.getEntityWorld().isClient()) return;
        ServerWorld world = (ServerWorld) this.getEntityWorld();

        net.minecraft.item.Item itemForm = ShipItems.forModel(getModelName());
        if (itemForm == null) {
            player.sendMessage(net.minecraft.text.Text.of(
                    "Unknown ship model " + getModelName() + " — can't pack"), true);
            return;
        }

        for (int i = 0; i < inventory.size(); i++) {
            net.minecraft.item.ItemStack s = inventory.getStack(i);
            if (!s.isEmpty()) this.dropStack(world, s);
        }
        inventory.clear();

        net.minecraft.item.ItemStack shipItem = new net.minecraft.item.ItemStack(itemForm);
        net.minecraft.nbt.NbtCompound nbt = new net.minecraft.nbt.NbtCompound();
        nbt.putString("Name", getShipName());
        nbt.putFloat("Health", getShipHealth());
        nbt.putFloat("Fuel", getFuelLevel());
        shipItem.set(net.minecraft.component.DataComponentTypes.CUSTOM_DATA,
                net.minecraft.component.type.NbtComponent.of(nbt));

        if (!player.getInventory().insertStack(shipItem)) {
            this.dropStack(world, shipItem);
        }

        this.removeAllPassengers();
        this.discard();
        player.sendMessage(net.minecraft.text.Text.of(
                "Ship packed up — cargo dropped at site"), true);
    }

    /**
     * Fire every loaded weapon slot. Each slot has its own cooldown
     * and consumes one unit of its stack per shot. Mount position is
     * a forward offset from ship origin (1.5 along heading, 0.5 up).
     */
    public void fireWeapons(net.minecraft.entity.LivingEntity pilot, float aimYaw, float aimPitch) {
        if (this.getEntityWorld().isClient()) return;
        ServerWorld sw = (ServerWorld) this.getEntityWorld();

        double yawRad = Math.toRadians(aimYaw);
        double pitchRad = Math.toRadians(aimPitch);
        double dx = -Math.sin(yawRad) * Math.cos(pitchRad);
        double dy = -Math.sin(pitchRad);
        double dz = Math.cos(yawRad) * Math.cos(pitchRad);
        Vec3d aim = new Vec3d(dx, dy, dz).normalize();

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

            Vec3d local;
            if (!localMounts.isEmpty()) {
                local = localMounts.get(i % localMounts.size());
            } else {
                local = new Vec3d(0.0, 0.6, 1.5);
            }
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

    public String getOwnerName() {
        return this.dataTracker.get(OWNER_NAME);
    }
    public void setOwnerName(String name) {
        this.dataTracker.set(OWNER_NAME, name != null ? name : "");
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

    /** Boost reservoir 0..1; drains while throttle > 1.0, regens otherwise. */
    public float getBoostReserve() { return this.dataTracker.get(BOOST_RESERVE); }

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
        upgradesHashCache = -1;
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
        int tntCount = 0;
        for (int i = 0; i < inventory.size(); i++) {
            net.minecraft.item.ItemStack s = inventory.getStack(i);
            if (s.isOf(net.minecraft.item.Items.TNT)) tntCount += s.getCount();
        }

        for (int i = 0; i < inventory.size(); i++) {
            net.minecraft.item.ItemStack s = inventory.getStack(i);
            if (!s.isEmpty()) this.dropStack(world, s);
        }
        inventory.clear();
        if (getStats().canExplodeOnCrash() || tntCount > 0) {
            float power = 2.5f + Math.min(8.0f, tntCount * 0.5f);
            world.createExplosion(this, this.getX(), this.getY(), this.getZ(),
                    power, World.ExplosionSourceType.MOB);
        }
        for (net.minecraft.entity.mob.MobEntity mob : world
                .getEntitiesByClass(net.minecraft.entity.mob.MobEntity.class,
                        this.getBoundingBox().expand(20.0),
                        m -> m.isLeashed() && m.getLeashHolder() == this)) {
            mob.detachLeash();
        }
        this.removeAllPassengers();
        this.discard();
    }

    @Override
    public boolean isCollidable(Entity other) { return true; }

    /**
     * Ship-vs-ship collision exchanges velocity instead of vanilla's
     * tiny shove. Two airships ramming each other now bounce off with
     * roughly conserved momentum (scaled by stats.mass) and take a
     * sliver of damage proportional to closing speed — so dogfighting
     * has a melee option for free.
     */
    @Override
    public void pushAwayFrom(Entity other) {
        if (!(other instanceof ShipEntity peer)) {
            super.pushAwayFrom(other);
            return;
        }
        Vec3d delta = new Vec3d(
                this.getX() - other.getX(),
                this.getY() - other.getY(),
                this.getZ() - other.getZ());
        double dist = delta.length();
        if (dist < 1.0e-3) return;
        Vec3d push = delta.normalize();

        float myMass = getStats().mass();
        float theirMass = peer.getStats().mass();
        float massSum = Math.max(0.5f, myMass + theirMass);
        double myShare = theirMass / massSum;
        double theirShare = myMass / massSum;

        double closingSpeed = this.getVelocity().subtract(other.getVelocity()).length();
        double impulse = 0.08 + closingSpeed * 0.25;

        this.setVelocity(this.getVelocity().add(push.multiply(impulse * myShare)));
        peer.setVelocity(peer.getVelocity().add(push.multiply(-impulse * theirShare)));

        if (closingSpeed > 0.4 && !this.getEntityWorld().isClient()
                && this.getEntityWorld() instanceof ServerWorld sw) {
            float dmg = (float) Math.min(8.0, closingSpeed * 4.0);
            this.damage(sw, this.getDamageSources().generic(), dmg);
            peer.damage(sw, peer.getDamageSources().generic(), dmg);
        }
    }

    @Override
    public boolean canHit() { return true; }

    @Override
    public net.minecraft.text.Text getName() {
        String owner = getOwnerName();
        String ship = getShipName();
        if (owner.isEmpty() && ship.isEmpty()) return super.getName();
        String label;
        if (!ship.isEmpty() && !owner.isEmpty()) {
            label = owner + "'s " + ship;
        } else if (!ship.isEmpty()) {
            label = ship;
        } else {
            label = owner + "'s Ship";
        }
        return net.minecraft.text.Text.literal(label);
    }

    @Override
    public boolean shouldRenderName() {
        return !getOwnerName().isEmpty() || !getShipName().isEmpty();
    }

    @Override
    public EntityDimensions getDimensions(net.minecraft.entity.EntityPose pose) {
        FlightStats s = getStats();
        return EntityDimensions.changing(s.boundingWidth(), s.boundingHeight());
    }

    @Override
    public ActionResult interact(PlayerEntity player, Hand hand) {
        net.minecraft.item.ItemStack stack = player.getStackInHand(hand);

        if (player.isSneaking() && stack.isEmpty()) {
            if (player instanceof ServerPlayerEntity sp) {
                sp.openHandledScreen(new net.minecraft.screen.SimpleNamedScreenHandlerFactory(
                        (syncId, playerInv, p) -> new ShipScreenHandler(syncId, playerInv, inventory),
                        net.minecraft.text.Text.literal(getDisplayLabel())
                ));
            }
            return ActionResult.SUCCESS;
        }
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

        if (getShipHealth() < MAX_HEALTH) {
            float repairAmt = 0f;
            if (stack.isOf(net.minecraft.item.Items.IRON_INGOT))            repairAmt = 25f;
            else if (stack.isOf(net.minecraft.item.Items.IRON_BLOCK))       repairAmt = 50f;
            else if (stack.isOf(net.minecraft.item.Items.COPPER_INGOT))     repairAmt = 15f;
            else if (stack.isOf(net.minecraft.item.Items.NETHERITE_INGOT))  repairAmt = 60f;
            if (repairAmt > 0f) {
                float before = getShipHealth();
                setShipHealth(before + repairAmt);
                if (!player.getAbilities().creativeMode) stack.decrement(1);
                if (!this.getEntityWorld().isClient()) {
                    player.sendMessage(net.minecraft.text.Text.of(
                            String.format("Ship repaired: %.0f → %.0f / %.0f",
                                    before, getShipHealth(), MAX_HEALTH)), true);
                }
                return ActionResult.SUCCESS;
            }
        }

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

        if (player.isSneaking() && stack.isOf(net.minecraft.item.Items.SHEARS)) {
            if (!ownerOrOpCanModify(player)) {
                if (!this.getEntityWorld().isClient()) {
                    player.sendMessage(net.minecraft.text.Text.of("Not your ship"), true);
                }
                return ActionResult.PASS;
            }
            pickupAsItem(player);
            return ActionResult.SUCCESS;
        }

        if (stack.isOf(net.minecraft.item.Items.LEAD) && !this.getEntityWorld().isClient()) {
            int transferred = 0;
            net.minecraft.util.math.Box scan = player.getBoundingBox().expand(10.0);
            for (net.minecraft.entity.Leashable mob : this.getEntityWorld()
                    .getEntitiesByClass(net.minecraft.entity.mob.MobEntity.class, scan,
                            m -> m.isLeashed() && m.getLeashHolder() == player)) {
                mob.attachLeash(this, true);
                transferred++;
            }
            if (transferred > 0) {
                player.sendMessage(net.minecraft.text.Text.of(
                        "Towed " + transferred + " entit" + (transferred == 1 ? "y" : "ies")), true);
                return ActionResult.SUCCESS;
            }
        }

        if (player instanceof ServerPlayerEntity && this.getPassengerList().size() < seatCapacity()) {
            player.startRiding(this);
            return ActionResult.SUCCESS;
        }
        return ActionResult.PASS;
    }

    /**
     * Cargo load fraction (0.0 empty .. 1.0 every storage slot full to its
     * max stack size). Used to apply a flight penalty so heavy hauls feel
     * sluggish — mirrors IA's mass-aware engine response without exposing
     * an extra stat to JSON.
     */
    private float computeCargoLoad() {
        int filled = 0;
        int capacity = 0;
        for (int i = 0; i < ShipInventory.STORAGE_COUNT; i++) {
            net.minecraft.item.ItemStack s = inventory.getStack(ShipInventory.STORAGE_START + i);
            int max = s.isEmpty() ? 64 : s.getMaxCount();
            capacity += max;
            filled += s.getCount();
        }
        return capacity == 0 ? 0f : (float) filled / (float) capacity;
    }

    private int seatCapacity() {
        List<List<Vec3d>> seats = FlightStatsRegistry.getSeats(getModelName());
        return seats.isEmpty() ? 1 : seats.get(seats.size() - 1).size();
    }

    @Override
    protected boolean canAddPassenger(Entity passenger) {
        return this.getPassengerList().size() < seatCapacity() && passenger instanceof PlayerEntity;
    }

    @Override
    protected Vec3d getPassengerAttachmentPos(Entity passenger,
                                              EntityDimensions dimensions,
                                              float scaleFactor) {
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

    @Override
    public void tick() {
        super.tick();

        FlightStats stats = getStats();
        float heading = this.getYaw();
        float ts = getTargetSpeed();
        float vi = getVerticalIntent();
        boolean ridden = hasPassengers();
        boolean fueled = getFuelLevel() > 0f;

        boolean submerged = this.isSubmergedInWater();
        if (!fueled || submerged) ts = 0f;

        float cargoLoad = computeCargoLoad();
        float loadPenalty = Math.min(0.5f, cargoLoad * 0.5f);
        float effectiveTarget = ts * (1.0f - loadPenalty);

        if (!this.getEntityWorld().isClient()) {
            float reserve = getBoostReserve();
            if (effectiveTarget > 1.0f) {
                if (reserve > 0f) {
                    reserve = Math.max(0f, reserve - 0.01f);
                } else {
                    effectiveTarget = Math.min(effectiveTarget, 1.0f);
                }
            } else {
                reserve = Math.min(1.0f, reserve + 0.005f);
            }
            this.dataTracker.set(BOOST_RESERVE, reserve);
        }
        if (getBoostReserve() <= 0f) effectiveTarget = Math.min(effectiveTarget, 1.0f);

        enginePower.update(ridden && fueled && !submerged ? effectiveTarget : 0.0f);
        verticalDrive.update(ridden ? vi : 0.0f);

        float headingDelta = ((heading - lastHeading + 540f) % 360f) - 180f;
        bankRoll = bankRoll * 0.85f + headingDelta * stats.rollFactor() * 0.15f;
        lastHeading = heading;

        if (this.isTouchingWater()) {
            inWaterLevel = Math.min(1.0f, inWaterLevel + 0.05f);
        } else {
            inWaterLevel = Math.max(0.0f, inWaterLevel - 0.05f);
        }

        if (this.getEntityWorld().isClient()) return;

        for (int i = 0; i < weaponCooldowns.length; i++) {
            if (weaponCooldowns[i] > 0) weaponCooldowns[i]--;
        }

        float power = enginePower.getSmooth();
        float vert = verticalDrive.getSmooth();

        if (power > 0.01f && fueled) {
            float burn = power * stats.engineSpeed() * 2.0f;
            setFuelLevel(getFuelLevel() - burn);
        }

        if (getShipHealth() < MAX_HEALTH && this.age % 20 == 0) {
            for (int i = 0; i < ShipInventory.STORAGE_COUNT; i++) {
                int slot = ShipInventory.STORAGE_START + i;
                net.minecraft.item.ItemStack patch = inventory.getStack(slot);
                if (patch.isEmpty()) continue;
                float repairAmt = 0f;
                if (patch.isOf(net.minecraft.item.Items.IRON_INGOT))           repairAmt = 25f;
                else if (patch.isOf(net.minecraft.item.Items.IRON_BLOCK))      repairAmt = 50f;
                else if (patch.isOf(net.minecraft.item.Items.COPPER_INGOT))    repairAmt = 15f;
                else if (patch.isOf(net.minecraft.item.Items.NETHERITE_INGOT)) repairAmt = 60f;
                if (repairAmt > 0f) {
                    setShipHealth(getShipHealth() + repairAmt);
                    patch.decrement(1);
                    if (patch.isEmpty()) inventory.setStack(slot, net.minecraft.item.ItemStack.EMPTY);
                    break;
                }
            }
        }

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

        double rad = Math.toRadians(heading);
        double fx = -Math.sin(rad);
        double fz = Math.cos(rad);

        Vec3d vel = this.getVelocity();

        double thrustScale = power * stats.engineSpeed() * (1.0f - inWaterLevel * 0.5f);
        vel = vel.add(fx * thrustScale, 0.0, fz * thrustScale);

        if (stats.pitchSpeed() <= 0.0f) {
            float verticalBonus = 1.0f;
            if (vert > 0.1f && this.getEntityWorld() instanceof ServerWorld swT) {
                int floorY = swT.getTopY(net.minecraft.world.Heightmap.Type.MOTION_BLOCKING,
                        (int) Math.floor(this.getX()), (int) Math.floor(this.getZ()));
                double agl = this.getY() - floorY;
                if (agl < 5.0 && agl >= 0.0) {
                    verticalBonus = 1.0f + (float) ((5.0 - agl) / 5.0) * 1.5f;
                }
            }
            vel = vel.add(0.0, vert * power * stats.verticalSpeed() * verticalBonus, 0.0);
        } else {
            float pitch = this.getPitch();
            pitch += stats.pitchSpeed() * vert;
            pitch *= (1.0f - stats.stabilizer());
            this.setPitch(MathHelper.clamp(pitch, -75.0f, 75.0f));

            if (stats.glideFactor() > 0.0f) {
                double dy = lastY - this.getY();
                if (lastY != 0.0 && dy != 0.0) {
                    double glide = dy * stats.glideFactor();
                    vel = vel.add(fx * glide, 0.0, fz * glide);
                }
            }
        }
        lastY = this.getY();

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

        double gravity;
        if (autoParkHoverTicks > 0 && !ridden) {
            autoParkHoverTicks--;
            vel = vel.multiply(0.97, 1.0, 0.97);
            gravity = -0.005;
            if (this.age % 6 == 0
                    && this.getEntityWorld() instanceof ServerWorld swPark) {
                swPark.spawnParticles(net.minecraft.particle.ParticleTypes.CLOUD,
                        this.getX(), this.getY() - 0.4, this.getZ(),
                        2, 0.4, 0.05, 0.4, 0.0);
            }
        } else {
            gravity = -0.04 * (1.0 - power);
        }
        vel = vel.add(0.0, gravity, 0.0);

        if (stats.wind() > 0.0f && !this.isOnGround() && inWaterLevel < 0.5f) {
            ServerWorld sw = (ServerWorld) this.getEntityWorld();
            float windStrength = stats.wind()
                    * (sw.isRaining() ? 1.8f : 1.0f)
                    * (sw.isThundering() ? 2.2f : 1.0f);
            float nx = (float) Math.cos(this.age / 20.0 / stats.mass()) * windStrength;
            float nz = (float) Math.cos(this.age / 21.0 / stats.mass()) * windStrength;
            vel = vel.add(nx * 0.005, 0.0, nz * 0.005);
        }

        if (this.isOnGround() && stats.pitchSpeed() > 0.0f) {
            float p = this.getPitch();
            this.setPitch((p + stats.groundPitch()) * 0.9f - stats.groundPitch());
            vel = vel.multiply(stats.groundFriction(), 1.0, stats.groundFriction());
        }

        if (stats.canExplodeOnCrash() && this.isOnGround()) {
            double impact = -vel.y;
            if (impact > 1.5) {
                destroyAndExplode((ServerWorld) this.getEntityWorld());
                return;
            }
        }

        int caution = 0;
        ServerWorld sworld = (ServerWorld) this.getEntityWorld();
        if (vel.y < -0.15) {
            int floorY = sworld.getTopY(net.minecraft.world.Heightmap.Type.MOTION_BLOCKING,
                    (int) Math.floor(this.getX()), (int) Math.floor(this.getZ()));
            if (this.getY() - floorY < 6.0) caution |= CAUTION_PULL_UP;
        }
        if (this.getY() < sworld.getBottomY() + 4) caution |= CAUTION_VOID;
        if (getShipHealth() < MAX_HEALTH * 0.25f) caution |= CAUTION_DAMAGED;
        if (isFuelLow()) caution |= CAUTION_LOW_FUEL;
        if (caution != getCautionBits()) {
            this.dataTracker.set(CAUTION_BITS, (byte) caution);
        }

        int newCautions = caution & ~lastCautionBitsForSound;
        if ((newCautions & CAUTION_PULL_UP) != 0) {
            sworld.playSound(null, this.getX(), this.getY(), this.getZ(),
                    net.minecraft.sound.SoundEvents.BLOCK_NOTE_BLOCK_PLING.value(),
                    net.minecraft.sound.SoundCategory.NEUTRAL, 0.6f, 0.6f);
        }
        if ((newCautions & CAUTION_DAMAGED) != 0) {
            sworld.playSound(null, this.getX(), this.getY(), this.getZ(),
                    net.minecraft.sound.SoundEvents.BLOCK_ANVIL_LAND,
                    net.minecraft.sound.SoundCategory.NEUTRAL, 0.4f, 1.6f);
        }
        if ((newCautions & CAUTION_LOW_FUEL) != 0) {
            sworld.playSound(null, this.getX(), this.getY(), this.getZ(),
                    net.minecraft.sound.SoundEvents.BLOCK_NOTE_BLOCK_HAT.value(),
                    net.minecraft.sound.SoundCategory.NEUTRAL, 0.5f, 1.4f);
        }
        if ((caution & CAUTION_PULL_UP) != 0 && this.age % 8 == 0
                && (newCautions & CAUTION_PULL_UP) == 0) {
            sworld.playSound(null, this.getX(), this.getY(), this.getZ(),
                    net.minecraft.sound.SoundEvents.BLOCK_NOTE_BLOCK_PLING.value(),
                    net.minecraft.sound.SoundCategory.NEUTRAL, 0.4f, 0.6f);
        }
        lastCautionBitsForSound = (byte) caution;

        this.setVelocity(vel);
        if (vel.lengthSquared() > 1.0e-6) {
            this.move(MovementType.SELF, vel);
        }

        if (power > 0.3f && this.getEntityWorld() instanceof ServerWorld sw) {
            spawnTrailParticles(sw, power);
        }

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

        if (this.getEntityWorld() instanceof ServerWorld sw3) {
            spawnBannerParticles(sw3);
        }

        boolean nowOnGround = this.isOnGround();
        if (nowOnGround != lastOnGroundForDust
                && this.getEntityWorld() instanceof ServerWorld swDust) {
            swDust.spawnParticles(net.minecraft.particle.ParticleTypes.CLOUD,
                    this.getX(), this.getY() + 0.1, this.getZ(),
                    14, 1.2, 0.05, 1.2, 0.05);
            if (nowOnGround) {
                swDust.playSound(null, this.getX(), this.getY(), this.getZ(),
                        net.minecraft.sound.SoundEvents.ENTITY_HORSE_LAND,
                        net.minecraft.sound.SoundCategory.NEUTRAL, 0.5f, 0.8f);
            }
        }
        lastOnGroundForDust = nowOnGround;

        if (getShipHealth() < MAX_HEALTH * 0.25f && this.age % 3 == 0
                && this.getEntityWorld() instanceof ServerWorld swDmg) {
            swDmg.spawnParticles(net.minecraft.particle.ParticleTypes.LARGE_SMOKE,
                    this.getX(), this.getY() + 0.8, this.getZ(),
                    1, 0.2, 0.1, 0.2, 0.02);
        }

        if (this.getEntityWorld() instanceof ServerWorld sw2) {
            net.minecraft.sound.SoundEvent loopSound = resolveEngineSound(stats.engineSound());
            if (lastEnginePowerForSound < 0.05f && power >= 0.05f) {
                sw2.playSound(null, this.getX(), this.getY(), this.getZ(),
                        net.minecraft.sound.SoundEvents.ITEM_FLINTANDSTEEL_USE,
                        net.minecraft.sound.SoundCategory.NEUTRAL,
                        0.6f, 0.8f);
                sw2.spawnParticles(net.minecraft.particle.ParticleTypes.LARGE_SMOKE,
                        this.getX(), this.getY() + 0.6, this.getZ(),
                        12, 0.5, 0.2, 0.5, 0.04);
            }
            if (lastEnginePowerForSound >= 0.05f && power < 0.05f) {
                sw2.playSound(null, this.getX(), this.getY(), this.getZ(),
                        net.minecraft.sound.SoundEvents.BLOCK_FIRE_EXTINGUISH,
                        net.minecraft.sound.SoundCategory.NEUTRAL,
                        0.4f, 1.0f);
            }
            if (power > 0.05f && loopSound != null) {
                int props = Math.max(1, stats.propellerCount());
                int cadence = Math.max(1, (int) ((12 - 8 * power) / Math.sqrt(props)));
                if (this.age % cadence == 0) {
                    float pitch = 0.5f + 0.7f * power;
                    float volume = (0.35f + 0.3f * power) * Math.min(1.6f, 0.8f + props * 0.2f);
                    sw2.playSound(null, this.getX(), this.getY(), this.getZ(),
                            loopSound,
                            net.minecraft.sound.SoundCategory.NEUTRAL,
                            volume, pitch);
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
     * Particle type comes from stats.trailParticle; positions come from
     * stats.trailOffsets when set, else fall back to legacy model-name
     * dispatch (wing-tip / rotor wash / aft exhaust).
     */
    private void spawnTrailParticles(ServerWorld sw, float power) {
        String model = getModelName();
        FlightStats stats = getStats();
        net.minecraft.particle.ParticleEffect particle = resolveTrailParticle(stats.trailParticle(), model);
        if (particle == null) return;

        java.util.List<Vec3d> offsets = FlightStatsRegistry.getTrailOffsets(model);
        if (!offsets.isEmpty()) {
            if (this.age % 3 != 0) return;
            double yawRad = Math.toRadians(this.getYaw());
            double cosY = Math.cos(yawRad);
            double sinY = Math.sin(yawRad);
            for (Vec3d local : offsets) {
                double wx = this.getX() + local.x * cosY - local.z * sinY;
                double wy = this.getY() + local.y;
                double wz = this.getZ() + local.x * sinY + local.z * cosY;
                sw.spawnParticles(particle, wx, wy, wz, 1, 0.05, 0.05, 0.05, 0.01);
            }
            return;
        }

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

        if (this.getPassengerList().isEmpty() && !this.isOnGround()) {
            autoParkHoverTicks = 200;
        }

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

    @Override
    public Vec3d updatePassengerForDismount(net.minecraft.entity.LivingEntity passenger) {
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

    @Override
    protected void initDataTracker(net.minecraft.entity.data.DataTracker.Builder builder) {
        builder.add(MODEL_NAME, "immersive_aircraft/airship");
        builder.add(SHIP_NAME, "");
        builder.add(SHIP_ID, "");
        builder.add(OWNER_NAME, "");
        builder.add(SHIP_HEALTH, MAX_HEALTH);
        builder.add(TARGET_SPEED, 0.0f);
        builder.add(VERTICAL_INTENT, 0.0f);
        builder.add(FUEL_LEVEL, MAX_FUEL);
        builder.add(UPGRADES_CSV, "");
        builder.add(BANNER_ITEM_ID, "");
        builder.add(CAUTION_BITS, (byte) 0);
        builder.add(BOOST_RESERVE, 1.0f);
    }

    @Override
    public void readCustomData(ReadView view) {
        this.dataTracker.set(SHIP_ID, view.getString("ShipId", ""));
        this.ownerUuidStr = view.getString("OwnerUuid", "");
        setOwnerName(view.getString("OwnerName", ""));
        setModelName(view.getString("ModelName", "immersive_aircraft/airship"));
        setShipName(view.getString("ShipName", ""));
        this.setYaw(view.getFloat("Heading", 0.0f));
        this.setPitch(view.getFloat("Pitch", 0.0f));
        setTargetSpeed(view.getFloat("TargetSpeed", 0.0f));
        setShipHealth(view.getFloat("ShipHealth", MAX_HEALTH));
        setFuelLevel(view.getFloat("FuelLevel", MAX_FUEL));

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
        view.putString("OwnerName", getOwnerName());
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
