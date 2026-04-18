package com.kbve.statetree.bbmodel;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * JSON parsing + math utilities for BBModel loading.
 *
 * <p>Adapted from immersive_aircraft.util.Utils (GPL-3.0).
 * Original: https://github.com/Luke100000/ImmersiveAircraft
 */
public final class BBModelUtils {

    private BBModelUtils() {}

    public static boolean getBooleanElement(JsonObject object, String member) {
        JsonElement element = object.getAsJsonPrimitive(member);
        if (element == null) return false;
        return element.getAsBoolean();
    }

    public static boolean isNull(JsonObject object, String member) {
        return object.has(member) && object.get(member).isJsonNull();
    }

    public static int getIntElement(JsonObject object, String member) {
        return getIntElement(object, member, 0);
    }

    public static int getIntElement(JsonObject object, String member, int defaultValue) {
        JsonElement element = object.getAsJsonPrimitive(member);
        if (element == null) return defaultValue;
        if (element instanceof JsonPrimitive primitive && primitive.isNumber()) {
            return primitive.getAsInt();
        }
        return defaultValue;
    }

    public static Vector3f parseVector(JsonObject element, String member) {
        JsonArray array = element.getAsJsonArray(member);
        if (array == null) return new Vector3f();
        return new Vector3f(
                array.get(0).getAsFloat(),
                array.get(1).getAsFloat(),
                array.get(2).getAsFloat()
        );
    }

    public static Quaternionf fromXYZ(float pitch, float yaw, float roll) {
        Quaternionf quaternion = new Quaternionf();
        quaternion.rotationZYX(roll, yaw, pitch);
        return quaternion;
    }

    public static Quaternionf fromXYZ(Vector3f rotation) {
        return fromXYZ(rotation.x, rotation.y, rotation.z);
    }
}
