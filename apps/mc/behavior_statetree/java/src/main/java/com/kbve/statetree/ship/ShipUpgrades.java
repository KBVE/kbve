package com.kbve.statetree.ship;

import net.minecraft.item.Item;
import net.minecraft.item.Items;

import java.util.HashMap;
import java.util.Map;

/**
 * Maps vanilla items to {@link FlightStats} modifiers when installed
 * as ship upgrades. Mirrors ImmersiveAircraft's upgrade-item slot
 * system without needing custom items.
 *
 * <p>Apply via {@link #apply}: takes a base FlightStats and a list of
 * installed upgrade items, returns a new FlightStats with each known
 * upgrade's modifier applied multiplicatively / additively.
 */
public final class ShipUpgrades {

    /** Maximum number of upgrade slots per ship — matches IA airship. */
    public static final int MAX_SLOTS = 4;

    /** Multiplicative + additive stat modifiers from one installed upgrade. */
    public record Mod(
            float engineSpeedMul,
            float verticalSpeedMul,
            float liftMul,
            float horizontalDecayMul,
            float verticalDecayMul,
            float windMul,
            float stabilizerMul,
            float glideFactorAdd,
            float yawSpeedMul,
            float rollFactorMul
    ) {
        public static final Mod IDENTITY = new Mod(
                1f, 1f, 1f, 1f, 1f, 1f, 1f, 0f, 1f, 1f);
    }

    private static final Map<Item, Mod> REGISTRY = new HashMap<>();

    static {
        // Diamond — faster engine.
        REGISTRY.put(Items.DIAMOND, new Mod(
                1.30f, 1f, 1f, 1f, 1f, 1f, 1f, 0f, 1f, 1f));
        // Redstone block — stronger vertical thrust.
        REGISTRY.put(Items.REDSTONE_BLOCK, new Mod(
                1f, 1.50f, 1f, 1f, 1f, 1f, 1f, 0f, 1f, 1f));
        // Gold block — tighter heading lock.
        REGISTRY.put(Items.GOLD_BLOCK, new Mod(
                1f, 1f, 1.30f, 1f, 1f, 1f, 1f, 0f, 1f, 1f));
        // Copper block — better cruise (less drag perpendicular to heading).
        REGISTRY.put(Items.COPPER_BLOCK, new Mod(
                1f, 1f, 1f, 1.03f, 1.03f, 1f, 1f, 0f, 1f, 1f));
        // Lantern — less wind sensitivity.
        REGISTRY.put(Items.LANTERN, new Mod(
                1f, 1f, 1f, 1f, 1f, 0.70f, 1f, 0f, 1f, 1f));
        // Feather — adds glide (forward thrust on descent).
        REGISTRY.put(Items.FEATHER, new Mod(
                1f, 1f, 1f, 1f, 1f, 1f, 1f, 0.05f, 1f, 1f));
        // Packed ice — stronger pitch stabilizer.
        REGISTRY.put(Items.PACKED_ICE, new Mod(
                1f, 1f, 1f, 1f, 1f, 1f, 1.50f, 0f, 1f, 1f));
        // Ender pearl — sharper turning + roll.
        REGISTRY.put(Items.ENDER_PEARL, new Mod(
                1f, 1f, 1f, 1f, 1f, 1f, 1f, 0f, 1.30f, 1.20f));
    }

    private ShipUpgrades() {}

    /** Whether the given item is installable as an upgrade. */
    public static boolean isUpgrade(Item item) {
        return REGISTRY.containsKey(item);
    }

    /** Lookup the modifier for a single item. {@code Mod.IDENTITY} if unknown. */
    public static Mod modFor(Item item) {
        return REGISTRY.getOrDefault(item, Mod.IDENTITY);
    }

    /**
     * Compose a new {@link FlightStats} by applying each installed
     * upgrade's mod on top of the base stats. Order-independent.
     */
    public static FlightStats apply(FlightStats base, Iterable<Item> installed) {
        float engine = base.engineSpeed();
        float vert = base.verticalSpeed();
        float lift = base.lift();
        float hDec = base.horizontalDecay();
        float vDec = base.verticalDecay();
        float wind = base.wind();
        float stab = base.stabilizer();
        float glide = base.glideFactor();
        float yaw = base.yawSpeed();
        float roll = base.rollFactor();

        for (Item item : installed) {
            Mod m = modFor(item);
            engine *= m.engineSpeedMul();
            vert *= m.verticalSpeedMul();
            lift *= m.liftMul();
            hDec *= m.horizontalDecayMul();
            vDec *= m.verticalDecayMul();
            wind *= m.windMul();
            stab *= m.stabilizerMul();
            glide += m.glideFactorAdd();
            yaw *= m.yawSpeedMul();
            roll *= m.rollFactorMul();
        }

        // Clamp decay below 1 so velocity always settles.
        hDec = Math.min(0.999f, hDec);
        vDec = Math.min(0.999f, vDec);
        lift = Math.min(0.95f, lift);

        return new FlightStats(
                yaw, base.pitchSpeed(), engine, vert, glide, lift,
                hDec, vDec, roll, stab, wind, base.mass(),
                base.groundFriction(), base.groundPitch(),
                base.engineReaction(), base.verticalReaction(),
                base.boundingWidth(), base.boundingHeight(),
                base.cameraZoom(), base.canExplodeOnCrash()
        );
    }
}
