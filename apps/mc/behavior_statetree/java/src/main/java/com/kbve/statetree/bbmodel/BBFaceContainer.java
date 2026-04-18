package com.kbve.statetree.bbmodel;

public interface BBFaceContainer {
    String getName();

    int getColor();

    Iterable<BBFace> getFaces();

    default boolean enableCulling() {
        return false;
    }
}
