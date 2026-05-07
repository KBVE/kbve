package com.kbve.statetree.ship;

/**
 * Smoothed float that decays toward a target over a configurable
 * number of steps (1 / step = lerp factor per tick). Ported from
 * ImmersiveAircraft to drive engine-power and input ramps.
 */
public final class InterpolatedFloat {
    private float value;
    private float last;
    private float valueSmooth;
    private float lastSmooth;
    private float steps;

    public InterpolatedFloat(float steps) {
        this.steps = 1.0f / steps;
    }

    public InterpolatedFloat() {
        this(5.0f);
    }

    public void update(float target) {
        last = value;
        value = target;
        lastSmooth = valueSmooth;
        valueSmooth = valueSmooth * (1.0f - steps) + target * steps;
    }

    public void setSteps(float steps) {
        this.steps = 1.0f / steps;
    }

    public float getSmooth() {
        return valueSmooth;
    }

    public float getValue() {
        return value;
    }

    public float getDiff() {
        return value - last;
    }
}
