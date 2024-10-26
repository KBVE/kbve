package net.runelite.client.plugins.microbot.kbve;

//  [Script] - Majority of the base script is from the AutoCooking, I am just going to strip it down and get a better understanding of the logical flow.

//  [RUNELITE]
import net.runelite.api.AnimationID;
import net.runelite.api.NPC;
import net.runelite.api.TileObject;

//  [Microbot]
import net.runelite.client.plugins.microbot.Microbot;
import net.runelite.client.plugins.microbot.Script;

//  [Microbot Utils]
import net.runelite.client.plugins.microbot.util.antiban.Rs2Antiban;
import net.runelite.client.plugins.microbot.util.antiban.Rs2AntibanSettings;
import net.runelite.client.plugins.microbot.util.antiban.enums.Activity;
import net.runelite.client.plugins.microbot.util.bank.Rs2Bank;
import net.runelite.client.plugins.microbot.util.camera.Rs2Camera;
import net.runelite.client.plugins.microbot.util.dialogues.Rs2Dialogue;
import net.runelite.client.plugins.microbot.util.gameobject.Rs2GameObject;
import net.runelite.client.plugins.microbot.util.inventory.Rs2Inventory;
import net.runelite.client.plugins.microbot.util.keyboard.Rs2Keyboard;
import net.runelite.client.plugins.microbot.util.math.Random;
import net.runelite.client.plugins.microbot.util.math.Rs2Random;
import net.runelite.client.plugins.microbot.util.npc.Rs2Npc;
import net.runelite.client.plugins.microbot.util.player.Rs2Player;
import net.runelite.client.plugins.microbot.util.walker.Rs2Walker;
import net.runelite.client.plugins.microbot.util.widget.Rs2Widget;

//  [Java]
import java.awt.event.KeyEvent;
import java.util.concurrent.TimeUnit;

//  [KBVE]
import net.runelite.client.plugins.microbot.kbve.KBVEConfig;

//  [ENUM]
enum KBVEStateMachine {
    IDLE,
    TASK,
    API,
}

public class KBVEScripts extends Script {


    private KBVEStateMachine state;
    private boolean init;


    public boolean run(KBVEConfig config) {

        //  [Microbot]
        Microbot.enableAutoRunOn = false;
        Rs2Antiban.resetAntibanSettings();
        init = true;

        //  [Schedule]
          mainScheduledFuture = scheduledExecutorService.scheduleWithFixedDelay(() -> {
            try {
                if (!Microbot.isLoggedIn()) return;
                if (!super.run()) return;
                if (Rs2AntibanSettings.actionCooldownActive) return;

                if (init) {
                    if (initialPlayerLocation == null) {
                        initialPlayerLocation = Rs2Player.getWorldLocation();
                    }

                    
                }

                if (Rs2Player.isMoving() || Rs2Player.isAnimating() || Microbot.pauseAllScripts) return;

                switch (state) {
                    case IDLE:
                        //  [IDLE]
                        break;
                    case TASK:
                        //  [TASK]
                        break;
                    case API:
                        //  [API]
                        break;
                }
            } catch (Exception ex) {
                Microbot.log(ex.getMessage());
            }
        }, 0, 1000, TimeUnit.MILLISECONDS);
        return true;
        
    }
    
    @Override
    public void shutdown(){
        super.shutdown();
        Rs2Antiban.resetAntibanSettings();
    }
}