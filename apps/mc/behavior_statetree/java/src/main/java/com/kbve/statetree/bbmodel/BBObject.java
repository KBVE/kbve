package com.kbve.statetree.bbmodel;

import com.google.gson.JsonObject;
import org.joml.Vector3f;
import com.kbve.statetree.bbmodel.BBModelUtils;

public class BBObject {
    public final String uuid;
    public final String name;

    public final Vector3f origin;
    public final Vector3f rotation;

    public final int color;

    public final boolean export;
    public final boolean visibility;

    public BBObject(JsonObject element) {
        this.uuid = element.getAsJsonPrimitive("uuid").getAsString();
        this.name = element.getAsJsonPrimitive("name").getAsString();

        this.origin = BBModelUtils.parseVector(element, "origin");
        this.origin.mul(1.0f / 16.0f);
        this.rotation = BBModelUtils.parseVector(element, "rotation");
        this.rotation.mul((float) (Math.PI / 180.0));

        this.color = BBModelUtils.getIntElement(element, "color");

        this.export = BBModelUtils.getBooleanElement(element, "export");
        this.visibility = BBModelUtils.getBooleanElement(element, "visibility");
    }

    public String getName() {
        return name;
    }

    public int getColor() {
        return color;
    }
}
