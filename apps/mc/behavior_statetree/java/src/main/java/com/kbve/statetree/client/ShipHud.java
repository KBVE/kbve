package com.kbve.statetree.client;

import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.text.Text;

/**
 * Client-side HUD overlay for ship piloting.
 *
 * <p>When the player is at the helm (actively steering a ship), this
 * renders:
 * <ul>
 *   <li>Hull integrity bar (green → yellow → red)</li>
 *   <li>Ship name</li>
 *   <li>Heading compass</li>
 *   <li>Speed indicator</li>
 * </ul>
 *
 * <p>When not piloting, nothing is rendered.
 */
public class ShipHud implements HudRenderCallback {

    private final ClientShipTracker tracker;

    /** Ship ID the player is currently piloting (null if not at helm). */
    private String activeShipId = null;

    /** Current hull integrity from server (0-100). */
    private float integrity = 100f;

    /** Current heading from server. */
    private float heading = 0f;

    /** Ship name for display. */
    private String shipName = "";

    public ShipHud(ClientShipTracker tracker) {
        this.tracker = tracker;
    }

    /** Set when player mounts the helm. */
    public void setActive(String shipId) {
        this.activeShipId = shipId;
        ClientShipTracker.ClientShipState state = tracker.getShip(shipId);
        if (state != null) {
            this.shipName = state.shipName;
            this.heading = state.heading;
        }
    }

    /** Clear when player dismounts. */
    public void clearActive() {
        this.activeShipId = null;
    }

    /** Update from status packet. */
    public void updateStatus(String shipId, float integrity, float heading) {
        if (shipId.equals(activeShipId)) {
            this.integrity = integrity;
            this.heading = heading;
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

        // Background
        context.fill(barX - 1, barY - 1, barX + barWidth + 1, barY + barHeight + 1, 0x80000000);

        // Fill color based on integrity
        int fillWidth = (int) (barWidth * integrity / 100f);
        int color;
        if (integrity > 60) color = 0xFF00CC00;      // green
        else if (integrity > 30) color = 0xFFCCCC00;  // yellow
        else color = 0xFFCC0000;                       // red

        context.fill(barX, barY, barX + fillWidth, barY + barHeight, color);

        // Label
        String integrityText = String.format("Hull: %.0f%%", integrity);
        context.drawText(client.textRenderer, Text.of(integrityText),
                barX, barY - 12, 0xCCCCCC, true);

        // -- Heading compass (bottom center) --
        String compassText = String.format("Heading: %.0f\u00B0 %s",
                heading, compassDirection(heading));
        int compassWidth = client.textRenderer.getWidth(compassText);
        context.drawText(client.textRenderer, Text.of(compassText),
                (screenWidth - compassWidth) / 2, screenHeight - 30, 0xCCCCCC, true);

        // -- Controls hint (bottom right) --
        String controls = "W/S: Speed  A/D: Steer  Sneak: Dismount";
        int controlsWidth = client.textRenderer.getWidth(controls);
        context.drawText(client.textRenderer, Text.of("\u00A77" + controls),
                screenWidth - controlsWidth - 10, screenHeight - 15, 0x999999, true);
    }

    private static String compassDirection(float heading) {
        float h = ((heading % 360) + 360) % 360;
        if (h < 22.5 || h >= 337.5) return "N";
        if (h < 67.5) return "NE";
        if (h < 112.5) return "E";
        if (h < 157.5) return "SE";
        if (h < 202.5) return "S";
        if (h < 247.5) return "SW";
        if (h < 292.5) return "W";
        return "NW";
    }
}
