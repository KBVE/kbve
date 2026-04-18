package com.kbve.statetree.bbmodel;

import com.google.gson.JsonObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.LinkedList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import static com.kbve.statetree.bbmodel.BBTexture.MISSING;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class BBModel {
    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");
    public final BBMeta meta;
    public final List<BBTexture> textures = new LinkedList<>();
    public final LinkedList<BBObject> root;
    public final HashMap<String, BBObject> objects;
    public final HashMap<String, BBObject> objectsByName;
    public final List<BBAnimation> animations = new LinkedList<>();
    public final float textureWidth, textureHeight;
    public final Identifier id;

    public BBModel(JsonObject model, Identifier identifier) {
        this.meta = new BBMeta(model.get("meta"));
        this.root = new LinkedList<>();
        this.objects = new HashMap<>();
        this.objectsByName = new HashMap<>();
        this.id = identifier;

        JsonObject resolution = model.get("resolution").getAsJsonObject();
        this.textureWidth = resolution.getAsJsonPrimitive("width").getAsFloat();
        this.textureHeight = resolution.getAsJsonPrimitive("height").getAsFloat();

        model.get("textures").getAsJsonArray().forEach(element -> {
            BBTexture texture = new BBTexture(element.getAsJsonObject(), identifier);
            this.textures.add(texture);
        });

        model.get("elements").getAsJsonArray().forEach(element -> {
            String type = element.getAsJsonObject().get("type").getAsString();
            if (type.equals("cube")) {
                BBObject object = new BBCube(element.getAsJsonObject(), this);
                this.objects.put(object.uuid, object);
                this.objectsByName.put(object.name, object);
            } else if (type.equals("mesh")) {
                BBObject object = new BBMesh(element.getAsJsonObject(), this);
                this.objects.put(object.uuid, object);
                this.objectsByName.put(object.name, object);
            } else {
                LOGGER.warn("Unknown object type {}", type);
            }
        });

        model.get("outliner").getAsJsonArray().forEach(element -> {
            if (element.isJsonPrimitive()) {
                BBObject object = this.objects.get(element.getAsString());
                if (object != null) {
                    this.root.add(object);
                } else {
                    LOGGER.warn("Object with uuid {} not found", element.getAsString());
                }
            } else {
                BBObject bone = new BBBone(element.getAsJsonObject(), this);
                this.root.add(bone);
                this.objects.put(bone.uuid, bone);
                this.objectsByName.put(bone.name, bone);
            }
        });

        if (model.has("animations")) {
            model.get("animations").getAsJsonArray().forEach(element -> {
                BBAnimation animation = new BBAnimation(element.getAsJsonObject());
                this.animations.add(animation);
            });
        }
    }

    public float getTextureWidth(BBTexture texture) {
        return meta.modelFormat.equals("free") ? texture.uvWidth : textureWidth;
    }

    public float getTextureHeight(BBTexture texture) {
        return meta.modelFormat.equals("free") ? texture.uvHeight : textureHeight;
    }

    public BBTexture getTexture(int id) {
        return id < textures.size() ? textures.get(id) : MISSING;
    }
}
