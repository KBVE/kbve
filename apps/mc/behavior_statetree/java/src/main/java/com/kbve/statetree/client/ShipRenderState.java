package com.kbve.statetree.client;

import net.minecraft.client.render.entity.state.EntityRenderState;

/**
 * Render state snapshot for {@link com.kbve.statetree.ship.ShipEntity}.
 *
 * <p>In 1.21.11, {@code EntityRenderer.render()} takes a render state
 * object instead of the entity directly. This class carries the ship
 * fields the renderer needs — heading for rotation, modelName for
 * model lookup, age for animation time.
 */
public class ShipRenderState extends EntityRenderState {

    /** BBModel identifier path (e.g. "immersive_aircraft/airship"). */
    public String modelName = "";

    /** Yaw rotation in degrees (0-360). */
    public float heading = 0.0f;

    /** Animation time in ticks (continuous counter for propellers, sails). */
    public float animationTime = 0.0f;

    /** Auto-roll target derived from yaw rate (degrees, clamped). */
    public float targetRoll = 0.0f;

    /** Smoothed render roll, lerped toward targetRoll each frame. */
    public float renderRoll = 0.0f;

    /** Smoothed engine output (0..targetSpeed) — drives propeller spin + sound. */
    public float enginePower = 0.0f;

    /** Continuously-accumulated propeller rotation (degrees), engine-power scaled. */
    public float propellerSpin = 0.0f;

    /** Pitch in degrees — used for elevator deflection on planes. */
    public float pitchDeg = 0.0f;

    /** True when the ship is on/near the ground — drives landing-gear visibility. */
    public boolean onGround = false;
}

