package com.kbve.statetree.bbmodel;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonParseException;
import net.fabricmc.fabric.api.resource.SimpleSynchronousResourceReloadListener;
import net.minecraft.resource.Resource;
import net.minecraft.resource.ResourceManager;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.Reader;
import java.util.HashMap;
import java.util.Map;

/**
 * Loads .bbmodel files from resource packs at startup.
 *
 * <p>Adapted from ImmersiveAircraft (GPL-3.0).
 */
public class BBModelLoader implements SimpleSynchronousResourceReloadListener {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");
    private static final int PATH_SUFFIX_LENGTH = ".bbmodel".length();
    private static final int PATH_PREFIX_LENGTH = "objects/".length();

    public static final Map<Identifier, BBModel> MODELS = new HashMap<>();
    private final Gson gson = new Gson();

    @Override
    public Identifier getFabricId() {
        return Identifier.of("behavior_statetree", "bbmodel_loader");
    }

    @Override
    public void reload(ResourceManager manager) {
        MODELS.clear();
        for (Map.Entry<Identifier, Resource> entry :
                manager.findResources("objects", id -> id.getPath().endsWith(".bbmodel")).entrySet()) {
            Identifier location = entry.getKey();
            String path = location.getPath();
            Identifier modelId = Identifier.of(
                    location.getNamespace(),
                    path.substring(PATH_PREFIX_LENGTH, path.length() - PATH_SUFFIX_LENGTH)
            );
            try (BufferedReader reader = entry.getValue().getReader()) {
                JsonElement json = gson.fromJson(reader, JsonElement.class);
                MODELS.put(modelId, new BBModel(json.getAsJsonObject(), modelId));
                LOGGER.info("[BBModel] Loaded model '{}'", modelId);
            } catch (JsonParseException | IOException e) {
                LOGGER.error("[BBModel] Failed to load '{}' from {}: {}", modelId, location, e.getMessage());
            }
        }
        LOGGER.info("[BBModel] Loaded {} models total", MODELS.size());
    }
}
