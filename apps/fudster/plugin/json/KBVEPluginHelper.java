package net.runelite.client.plugins.microbot.kbve.json;

import com.google.gson.*;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginManager;

import javax.inject.Inject;

@Getter
@Setter
@ToString
public class KBVEPluginHelper {


    private String command; // The operation to perform, e.g., "enable" or "disable"
    private String pluginName; // The name of the plugin to manage
    private boolean status; // The current status of the plugin (enabled/disabled)

    @Inject
    private PluginManager pluginManager;

    //private final Gson gson = new Gson();
    private final Gson gson = new GsonBuilder()
            .registerTypeAdapter(Class.class, new ClassTypeAdapter())
            .addSerializationExclusionStrategy(new ReflectionExclusionStrategy())
            .addSerializationExclusionStrategy(new PhantomCleanableExclusionStrategy())
            .create();

    public KBVEPluginHelper() {
        // Default constructor
    }

    public KBVEPluginHelper(String command, String pluginName, boolean status) {
        this.command = command;
        this.pluginName = pluginName;
        this.status = status;
    }

    /**
     * Enable or disable a plugin and return its JSON representation.
     * @param command The command, e.g., "enable" or "disable".
     * @param pluginName The simple class name of the plugin.
     * @return JSON representation of the plugin's status.
     */
      public String managePlugin(String command, String pluginName) {
        Plugin plugin = findPlugin(pluginName);

        if (plugin == null) {
            System.out.println("[KBVE]: " + pluginName + " plugin was not found.");
            return gson.toJson(new KBVEPluginHelper(command, pluginName, false));
        }

        boolean status;
        if ("enable".equalsIgnoreCase(command)) {
            try {
                pluginManager.setPluginEnabled(plugin, true);
                pluginManager.startPlugin(plugin);
                status = true;
                System.out.println("[KBVE]: " + pluginName + " plugin has been enabled.");
            } catch (net.runelite.client.plugins.PluginInstantiationException e) {
                System.out.println("[KBVE]: Failed to start " + pluginName + " plugin: " + e.getMessage());
                return gson.toJson(new KBVEPluginHelper(command, pluginName, false));
            }
        } else if ("disable".equalsIgnoreCase(command)) {
            try {
                pluginManager.setPluginEnabled(plugin, false);
                pluginManager.stopPlugin(plugin);
                status = false;
                System.out.println("[KBVE]: " + pluginName + " plugin has been disabled.");
            } catch (net.runelite.client.plugins.PluginInstantiationException e) {
                System.out.println("[KBVE]: Failed to stop " + pluginName + " plugin: " + e.getMessage());
                return gson.toJson(new KBVEPluginHelper(command, pluginName, true));
            }
        } else {
            System.out.println("[KBVE]: Invalid command for " + pluginName + " plugin.");
            return gson.toJson(new KBVEPluginHelper(command, pluginName, false));
        }

        return gson.toJson(new KBVEPluginHelper(command, pluginName, status));
    }


    /**
     * Find a plugin by its class name.
     * @param pluginName The simple class name of the plugin to find.
     * @return The Plugin object if found, or null otherwise.
     */
    private Plugin findPlugin(String pluginName) {
        return pluginManager.getPlugins().stream()
                .filter(p -> p.getClass().getSimpleName().equalsIgnoreCase(pluginName))
                .findFirst()
                .orElse(null);
    }

     /**
     * Custom TypeAdapter for Class to handle serialization.
     */
    private static class ClassTypeAdapter extends TypeAdapter<Class<?>> {
        @Override
        public void write(JsonWriter out, Class<?> value) throws IOException {
            if (value == null) {
                out.nullValue();
                return;
            }
            out.value(value.getName()); // Serialize Class as its name
        }

        @Override
        public Class<?> read(JsonReader in) throws IOException {
            throw new UnsupportedOperationException("Deserialization of Class is not supported");
        }
    }

    /**
     * Custom ExclusionStrategy to skip problematic fields or classes.
     */
    private static class ReflectionExclusionStrategy implements ExclusionStrategy {
        @Override
        public boolean shouldSkipField(FieldAttributes f) {
            // Exclude fields related to Class or reflection
            return f.getDeclaredClass() == Class.class || f.getName().equals("accessibleObject");
        }

        @Override
        public boolean shouldSkipClass(Class<?> clazz) {
            // Skip problematic reflection-related classes
            return clazz.getName().startsWith("java.lang.reflect");
        }
    }

    /**
     * Custom ExclusionStrategy to handle problematic fields in Gson serialization.
     */
    private static class PhantomCleanableExclusionStrategy implements ExclusionStrategy {
        @Override
        public boolean shouldSkipField(FieldAttributes f) {
            return f.getName().equals("next");
        }

        @Override
        public boolean shouldSkipClass(Class<?> clazz) {
            return clazz.getName().contains("jdk.internal.ref.PhantomCleanable");
        }
    }
}