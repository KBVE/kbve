package com.kbve.statetree.ship;

/**
 * Per-model flight tuning. Values mirror ImmersiveAircraft's
 * {@code aircraft/*.json} property block (Luke100000/ImmersiveAircraft)
 * and are loaded by {@link FlightStatsRegistry} from
 * {@code data/behavior_statetree/aircraft/<name>.json}.
 *
 * @param yawSpeed         Heading change per tick at full input (deg).
 * @param pitchSpeed       Pitch change per tick at full input (deg). 0 = rotorcraft.
 * @param engineSpeed      Forward thrust scalar (m/tick at full power, before curve).
 * @param verticalSpeed    Climb/descent scalar (m/tick at full input).
 * @param glideFactor      Lift gained per block of descent.
 * @param lift             Heading-lock strength applied to velocity (0..1).
 * @param horizontalDecay  Per-tick velocity multiplier when not aligned with heading.
 * @param verticalDecay    Per-tick vertical velocity multiplier.
 * @param rollFactor       Bank degrees per yaw delta tick.
 * @param stabilizer       Pitch self-correction per tick (rotorcraft = 0.1).
 * @param wind             Random drift sensitivity.
 * @param mass             Wind oscillation period scaler.
 * @param groundFriction   Per-tick velocity multiplier on ground.
 * @param groundPitch      Pitch (deg) that aircraft settles to when grounded.
 * @param engineReaction   Ticks for engine power to fully ramp.
 * @param verticalReaction Ticks for vertical input to fully ramp.
 * @param boundingWidth    Entity bounding box width (blocks).
 * @param boundingHeight   Entity bounding box height (blocks).
 * @param cameraZoom       Third-person camera distance while riding.
 * @param canExplodeOnCrash Whether a hard impact triggers an explosion.
 * @param trailParticle    Vanilla particle ID for the engine trail. Empty
 *                         falls back to the legacy model-name-keyed dispatch
 *                         in {@code ShipEntity.spawnTrailParticles}.
 * @param engineSound      Vanilla SoundEvent ID for the engine loop.
 *                         Empty falls back to {@code minecraft:entity.minecart.riding}.
 * @param propellerCount   Approximate number of engines/propellers on the
 *                         aircraft. Scales engine loop volume + cadence
 *                         so a 4-engine bomber sounds beefier than a
 *                         single-prop trainer. Defaults to 1.
 */
public record FlightStats(
        float yawSpeed,
        float pitchSpeed,
        float engineSpeed,
        float verticalSpeed,
        float glideFactor,
        float lift,
        float horizontalDecay,
        float verticalDecay,
        float rollFactor,
        float stabilizer,
        float wind,
        float mass,
        float groundFriction,
        float groundPitch,
        float engineReaction,
        float verticalReaction,
        float boundingWidth,
        float boundingHeight,
        float cameraZoom,
        boolean canExplodeOnCrash,
        String trailParticle,
        String engineSound,
        int propellerCount
) {
    /** Default fallback when no JSON is found — tuned for an airship. */
    public static final FlightStats DEFAULT = new FlightStats(
            5.0f, 0.0f, 0.05f, 0.08f,
            0.0f, 0.1f, 0.97f, 0.925f,
            5.0f, 0.1f, 0.05f, 3.0f,
            0.5f, 0.0f, 50.0f, 20.0f,
            5.0f, 2.0f, 6.0f, false,
            "", "", 1
    );
}
