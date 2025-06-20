package net.runelite.client.plugins.microbot.kbve;

//  [Runelite]
import net.runelite.client.config.Config;
import net.runelite.client.config.ConfigGroup;
import net.runelite.client.config.ConfigItem;
import net.runelite.client.config.ConfigSection;

@ConfigGroup("kbve")
public interface KBVEConfig extends Config {


    @ConfigSection(
        name = "General",
        description = "General Section for Atlas Plugin",
        position = 0
    )
    String generalSection = "general";

    @ConfigSection(
        name = "API",
        description = "General API Settings",
        position = 1
    )
    String apiSection = "api";

    @ConfigSection(
        name = "Supabase",
        description = "Optional Supabase Integration",
        position = 2
    )
    String supabaseSection = "supabase";

    // General Settings
    @ConfigItem(
        name = "Enable Plugin",
        keyName = "enablePlugin",
        position = 0,
        description = "Toggle the KBVE plugin on or off",
        section = generalSection
    )
    default boolean enablePlugin() {
        return true;
    }

    @ConfigItem(
        name = "Debug Mode",
        keyName = "debugMode",
        position = 1,
        description = "Enable debug mode for additional logging",
        section = generalSection
    )
    default boolean debugMode() {
        return true;
    }

     // API Settings
    @ConfigItem(
        name = "API WS Endpoint",
        keyName = "apiEndpoint",
        position = 0,
        description = "Specify the API WS endpoint for the plugin",
        section = apiSection
    )
    default String apiEndpoint() {
        return "ws://localhost:8086/ws";
    }


    @ConfigItem(
        name = "API Key",
        keyName = "apiKey",
        position = 1,
        description = "API key used for authentication",
        section = apiSection
    )
    default String apiKey() {
        return "";
    }

    @ConfigItem(
        name = "Request Timeout",
        keyName = "requestTimeout",
        position = 2,
        description = "Specify the timeout duration for API requests (in seconds)",
        section = apiSection
    )
    default int requestTimeout() {
        return 30;
    }

    // Supabase Integration Settings
    @ConfigItem(
        name = "Enable Supabase",
        keyName = "enableSupabase",
        position = 0,
        description = "Toggle Supabase integration on or off",
        section = supabaseSection
    )
    default boolean enableSupabase() {
        return false;
    }

    @ConfigItem(
        name = "Supabase URL",
        keyName = "supabaseUrl",
        position = 1,
        description = "The Supabase project URL",
        section = supabaseSection
    )
    default String supabaseUrl() {
        return "https://qmpdruitzlownnnnjmpk.supabase.co";
    }

    @ConfigItem(
        name = "Supabase Key",
        keyName = "supabaseKey",
        position = 2,
        description = "The Supabase API key for authentication",
        section = supabaseSection
    )
    default String supabaseKey() {
        return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcGRydWl0emxvd25ubm5qbXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NjA0NTYsImV4cCI6MjA2NTIzNjQ1Nn0.OhD3qN4dq0TMA65qVGvry_QsZEeLKK7RbwYP3QzAvcY";
    }


    //  [UWU Socks]

    //  [KBVE Activity]
    @ConfigItem(
            name = "KBVE Activity",
            keyName = "kbveActivity",
            position = 3,
            description = "Choose Activity",
            section = generalSection
    )
    default KBVEActivity kbveActivity() {
        return KBVEActivity.PYTHON;
    }

}