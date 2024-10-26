package net.runelite.client.plugins.microbot.kbve;

//  [Runelite]
import net.runelite.client.config.Config;
import net.runelite.client.config.ConfigGroup;
import net.runelite.client.config.ConfigItem;
import net.runelite.client.config.ConfigSection;
//  [Microbot]
import net.runelite.client.plugins.microbot.util.inventory.DropOrder;

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
        return false;
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
        return "ws://localhost:8086/handshake";
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
        return "https://your-supabase-url.supabase.co";
    }

    @ConfigItem(
        name = "Supabase Key",
        keyName = "supabaseKey",
        position = 2,
        description = "The Supabase API key for authentication",
        section = supabaseSection
    )
    default String supabaseKey() {
        return "";
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



    // Optional Utility Setting
    @ConfigItem(
        name = "Drop Order",
        keyName = "dropOrder",
        position = 4,
        description = "The order in which to drop items",
        section = generalSection
    )
    default DropOrder getDropOrder() {
        return DropOrder.STANDARD;
    }
}