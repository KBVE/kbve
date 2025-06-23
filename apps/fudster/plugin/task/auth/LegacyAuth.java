package net.runelite.client.plugins.microbot.kbve.task.auth;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.Point;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.config.ConfigProfile;
import net.runelite.client.config.ProfileManager;
import net.runelite.client.plugins.microbot.Microbot;
import net.runelite.client.plugins.microbot.util.security.Encryption;
import net.runelite.client.plugins.microbot.util.security.Login;

@Slf4j
@RequiredArgsConstructor
public class LegacyAuth {

    private final ProfileManager profileManager;
    private final ConfigManager configManager;

    public boolean acceptEULA(int x, int y) {
        clickOnCanvas(350, 300);
        return true;
    }

    public boolean safeLogin(String username, String password, String pin, int world) {
        if (Microbot.isLoggedIn()) {
            Microbot.log("A user is already logged in");
            return true;
        }

        ConfigProfile profile = loadOrCreateProfile(username, password, pin, world);
        if (profile == null) {
            Microbot.log("Failed to create or load profile for user " + username);
            return false;
        }

        Login.activeProfile = profile;

        try {
            new Login(world);
            Microbot.log("Logging in with profile for user: " + username);
        } catch (Exception e) {
            Microbot.log("Error during login: " + e.getMessage());
        }

        return true;
    }

    private synchronized ConfigProfile loadOrCreateProfile(String username, String password, String bankPin, int world) {
        ConfigProfile profile = null;

        try (ProfileManager.Lock lock = profileManager.lock()) {
            profile = lock.findProfile(username);

            if (profile == null) {
                profile = lock.createProfile(username);
                log.info("Created new profile for user " + username);
                lock.dirty();
            } else {
                log.info("Profile already exists for user " + username);
            }
        } catch (Exception e) {
            log.error("Error creating profile: " + e.getMessage());
            return null;
        }

        try {
            String encryptedPassword = Encryption.encrypt(password);
            configManager.setPassword(profile, encryptedPassword);

            String encryptedBankPin = Encryption.encrypt(bankPin);
            configManager.setBankPin(profile, encryptedBankPin);

            configManager.setMember(profile, false);

            log.info("Profile created and configured for user " + username);
        } catch (Exception e) {
            log.error("Error configuring profile: " + e.getMessage());
            return null;
        }

        return profile;
    }

    public static void clickOnCanvas(int x, int y) {
        int actualX = Microbot.getClient().getViewportXOffset() + x;
        int actualY = Microbot.getClient().getViewportYOffset() + y;

        Microbot.getMouse().click(new Point(actualX, actualY));

        Microbot.log("Clicked at in-game coordinates (" + x + ", " + y + "), which maps to screen coordinates (" + actualX + ", " + actualY + ").");
    }
} 
