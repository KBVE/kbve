package com.kbve.statetree.client;

import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.text.Text;

/**
 * Client-side HUD overlay for airship piloting.
 *
 * <p>Shows:
 * <ul>
 *   <li>Ship name (top center)</li>
 *   <li>Hull integrity bar (bottom left)</li>
 *   <li>Directional compass — N/W/H/E/S layout (bottom center)</li>
 *   <li>Controls hint (bottom right)</li>
 * </ul>
 *
 * <p>The compass highlights whichever cardinal direction the player is
 * currently pressing. "H" in the center = hover (no input).
 */
public class ShipHud implements HudRenderCallback {

    private final ClientShipTracker tracker;

    private String activeShipId = null;
    private float integrity = 100f;
    private String shipName = "";

    // Current input state — set by ShipClientMod.setInputState() each tick.
    private boolean inputN = false, inputS = false, inputE = false, inputW = false;

    public ShipHud(ClientShipTracker tracker) {
        this.tracker = tracker;
    }

    public void setActive(String shipId) {
        this.activeShipId = shipId;
        ClientShipTracker.ClientShipState state = tracker.getShip(shipId);
        if (state != null) this.shipName = state.shipName;
    }

    public void clearActive() {
        this.activeShipId = null;
        inputN = inputS = inputE = inputW = false;
    }

    /** Update input state from ShipClientMod each client tick. */
    public void setInputState(boolean n, boolean s, boolean e, boolean w) {
        this.inputN = n;
        this.inputS = s;
        this.inputE = e;
        this.inputW = w;
    }

    public void updateStatus(String shipId, float integrity, float heading) {
        if (shipId.equals(activeShipId)) {
            this.integrity = integrity;
        }
    }

    public boolean isActive() {
        return activeShipId != null;
    }

    @Override
    public void onHudRender(DrawContext context, RenderTickCounter tickCounter) {
        if (activeShipId == null) return;

        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player == null) return;

        int screenWidth = client.getWindow().getScaledWidth();
        int screenHeight = client.getWindow().getScaledHeight();

        // -- Ship name (top center) --
        String nameText = "\u00A7l" + shipName;
        int nameWidth = client.textRenderer.getWidth(nameText);
        context.drawText(client.textRenderer, Text.of(nameText),
                (screenWidth - nameWidth) / 2, 10, 0xFFFFFF, true);

        // -- Hull integrity bar (bottom left) --
        int barX = 10;
        int barY = screenHeight - 30;
        int barWidth = 120;
        int barHeight = 8;
        context.fill(barX - 1, barY - 1, barX + barWidth + 1, barY + barHeight + 1, 0x80000000);
        int fillWidth = (int) (barWidth * integrity / 100f);
        int color;
        if (integrity > 60) color = 0xFF00CC00;
        else if (integrity > 30) color = 0xFFCCCC00;
        else color = 0xFFCC0000;
        context.fill(barX, barY, barX + fillWidth, barY + barHeight, color);
        context.drawText(client.textRenderer, Text.of(String.format("Hull: %.0f%%", integrity)),
                barX, barY - 12, 0xCCCCCC, true);

        // -- Directional compass (bottom center) --
        // Layout:
        //         N
        //     W   H   E
        //         S
        int compassCenterX = screenWidth / 2;
        int compassCenterY = screenHeight - 40;
        int spacing = 14;

        // Background panel
        context.fill(compassCenterX - 24, compassCenterY - 18,
                compassCenterX + 24, compassCenterY + 18, 0x80000000);

        int activeColor = 0xFFFFCC00;   // gold when pressed
        int inactiveColor = 0xFF888888; // gray when not
        int hoverColor = (!inputN && !inputS && !inputE && !inputW) ? 0xFF00CCFF : inactiveColor;

        // N (top)
        drawCenteredChar(context, client, "N", compassCenterX, compassCenterY - spacing,
                inputN ? activeColor : inactiveColor);
        // S (bottom)
        drawCenteredChar(context, client, "S", compassCenterX, compassCenterY + spacing - 8,
                inputS ? activeColor : inactiveColor);
        // W (left)
        drawCenteredChar(context, client, "W", compassCenterX - spacing, compassCenterY - 4,
                inputW ? activeColor : inactiveColor);
        // E (right)
        drawCenteredChar(context, client, "E", compassCenterX + spacing, compassCenterY - 4,
                inputE ? activeColor : inactiveColor);
        // H (center)
        drawCenteredChar(context, client, "H", compassCenterX, compassCenterY - 4, hoverColor);

        // -- Controls hint (bottom right) --
        String controls = "WASD: Move  Space: Up  Shift: Dismount";
        int controlsWidth = client.textRenderer.getWidth(controls);
        context.drawText(client.textRenderer, Text.of("\u00A77" + controls),
                screenWidth - controlsWidth - 10, screenHeight - 15, 0x999999, true);
    }

    private static void drawCenteredChar(DrawContext context, MinecraftClient client,
                                         String ch, int x, int y, int color) {
        int w = client.textRenderer.getWidth(ch);
        context.drawText(client.textRenderer, Text.of("\u00A7l" + ch), x - w / 2, y, color, true);
    }
}
