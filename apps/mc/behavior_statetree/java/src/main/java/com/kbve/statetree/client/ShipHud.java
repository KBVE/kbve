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
 *   <li>Directional compass — N/W/H/E/S layout (bottom center)</li>
 *   <li>Controls hint (bottom right)</li>
 * </ul>
 *
 * <p>The hull integrity bar was removed when ships transitioned from
 * block-based to entity-based rendering — there are no blocks left to
 * damage or count.
 */
public class ShipHud implements HudRenderCallback {

    private boolean active = false;
    private String shipName = "";

    // Current input state — set by ShipClientMod.setInputState() each tick.
    private boolean inputN = false, inputS = false, inputE = false, inputW = false;

    public void setActive(String shipName) {
        this.active = true;
        this.shipName = shipName != null ? shipName : "";
    }

    public void clearActive() {
        this.active = false;
        this.shipName = "";
        inputN = inputS = inputE = inputW = false;
    }

    /** Update input state from ShipClientMod each client tick. */
    public void setInputState(boolean n, boolean s, boolean e, boolean w) {
        this.inputN = n;
        this.inputS = s;
        this.inputE = e;
        this.inputW = w;
    }

    public boolean isActive() {
        return active;
    }

    @Override
    public void onHudRender(DrawContext context, RenderTickCounter tickCounter) {
        if (!active) return;

        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player == null) return;

        int screenWidth = client.getWindow().getScaledWidth();
        int screenHeight = client.getWindow().getScaledHeight();

        // -- Ship name (top center) --
        if (!shipName.isEmpty()) {
            String nameText = "\u00A7l" + shipName;
            int nameWidth = client.textRenderer.getWidth(nameText);
            context.drawText(client.textRenderer, Text.of(nameText),
                    (screenWidth - nameWidth) / 2, 10, 0xFFFFFF, true);
        }

        // -- Directional compass (bottom center) --
        //         N
        //     W   H   E
        //         S
        int compassCenterX = screenWidth / 2;
        int compassCenterY = screenHeight - 40;
        int spacing = 14;

        context.fill(compassCenterX - 24, compassCenterY - 18,
                compassCenterX + 24, compassCenterY + 18, 0x80000000);

        int activeColor = 0xFFFFCC00;   // gold when pressed
        int inactiveColor = 0xFF888888; // gray when not
        int hoverColor = (!inputN && !inputS && !inputE && !inputW) ? 0xFF00CCFF : inactiveColor;

        drawCenteredChar(context, client, "N", compassCenterX, compassCenterY - spacing,
                inputN ? activeColor : inactiveColor);
        drawCenteredChar(context, client, "S", compassCenterX, compassCenterY + spacing - 8,
                inputS ? activeColor : inactiveColor);
        drawCenteredChar(context, client, "W", compassCenterX - spacing, compassCenterY - 4,
                inputW ? activeColor : inactiveColor);
        drawCenteredChar(context, client, "E", compassCenterX + spacing, compassCenterY - 4,
                inputE ? activeColor : inactiveColor);
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
