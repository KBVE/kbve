package net.runelite.client.plugins.microbot.kbve;

//  [External]
import com.google.inject.Provides;
import lombok.extern.slf4j.Slf4j;

//  [Runelite]
import net.runelite.api.AnimationID;
import net.runelite.api.Client;
import net.runelite.api.Player;
import net.runelite.api.events.AnimationChanged;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;
import net.runelite.client.ui.overlay.OverlayManager;
import net.runelite.client.config.ProfileManager;
import net.runelite.client.game.WorldService;

//  [KBVE]
import net.runelite.client.plugins.microbot.kbve.json.KBVEPluginHelper;

//  [Micro]
import net.runelite.client.plugins.microbot.Microbot;
import net.runelite.client.plugins.microbot.util.mouse.VirtualMouse;

//  [Java]
import javax.inject.Inject;
import java.awt.*;


@PluginDescriptor(
    name = "KBVE Atlas",
    description = "Atlas AiO Plugin",
    tags = {"kbve", "python"},
    enabledByDefault = true
)

@Slf4j
public class KBVEPlugin extends Plugin {
    public static double version = 1.0;
    @Inject
    KBVEScripts kbveScripts;
    @Inject
    private KBVEConfig config;
    @Inject
    private Client client;
    @Inject
    private ClientThread clientThread;
    @Inject
    private OverlayManager overlayManager;
    @Inject
    private KBVEOverlay overlay;
    @Inject
    private ProfileManager profileManager;
    @Inject
    private WorldService worldService;
    @Inject
    private KBVEPluginHelper kbvePluginHelper;

    
    @Provides
    KBVEConfig provideConfig(ConfigManager configManager){
        return configManager.getConfig(KBVEConfig.class);
    }

    @Override
    protected void startUp() throws AWTException {
        Microbot.pauseAllScripts = false;
        Microbot.setClient(client);
        Microbot.setClientThread(clientThread);
        Microbot.setMouse(new VirtualMouse());
        Microbot.setProfileManager(profileManager);
        Microbot.setWorldService(worldService);
        
        if (overlayManager != null) {
            overlayManager.add(overlay);
        }

        String gpuStatusJson = kbvePluginHelper.managePlugin("disable", "GpuPlugin");

        switch (config.kbveActivity()) {
            case PYTHON:
                kbveScripts.run(config);
                Microbot.log("Python!");
            default:
                kbveScripts.run(config);
                Microbot.log("Default Chan!");
        }
    }

    protected void shutDown() {
        kbveScripts.shutdown();
        overlayManager.remove(overlay);
    }
}