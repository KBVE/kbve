package com.kbve.statetree.bbmodel;

import com.google.gson.JsonObject;
import com.kbve.statetree.bbmodel.BBModelUtils;

import java.util.LinkedList;
import java.util.List;

public class BBBone extends BBObject {
    public final List<BBObject> children = new LinkedList<>();

    public final boolean globalRotation;

    public BBBone(JsonObject element, BBModel model) {
        super(element);

        this.globalRotation = BBModelUtils.getBooleanElement(element, "rotation_global");

        element.getAsJsonObject().get("children").getAsJsonArray().forEach(child -> {
            if (child.isJsonObject()) {
                this.children.add(new BBBone(child.getAsJsonObject(), model));
            } else {
                BBObject object = model.objects.get(child.getAsString());
                if (object != null) {
                    this.children.add(object);
                }
            }
        });
    }
}
