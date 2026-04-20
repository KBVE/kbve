#ifndef RAREICON_WORLD_AMBIENT_INCLUDED
#define RAREICON_WORLD_AMBIENT_INCLUDED

// Globals pushed by WorldClockSystem. Declared outside UnityPerMaterial so
// every world shader can sample the same values without per-material state.
float4 _WorldAmbient;
float  _WorldDayT;
float  _WorldSunAngle;

// Multiply a linear RGB colour by the current ambient tint. `strength` lets
// individual shaders opt in to partial shading (projectiles read at 0.6 so
// they stay legible at night).
float3 ApplyWorldAmbient(float3 col, float strength)
{
    float3 tint = lerp(float3(1, 1, 1), _WorldAmbient.rgb, strength);
    return col * tint;
}

float3 ApplyWorldAmbient(float3 col)
{
    return ApplyWorldAmbient(col, 1.0);
}

#endif
