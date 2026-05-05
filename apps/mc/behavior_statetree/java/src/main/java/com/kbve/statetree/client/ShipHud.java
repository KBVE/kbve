package com.kbve.statetree.client;

import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.text.Text;

public class ShipHud implements HudRenderCallback {

    private boolean active = false;
    private String shipName = "";

    private boolean inputN = false, inputS = false, inputE = false, inputW = false;
    private boolean inputRise = false, inputLower = false, inputBoost = false;

    private float speed = 0f;
    private float heading = 0f;
    private int altitude = 0;
    private float health = 100f;
    private float maxHealth = 100f;

    public void setActive(String shipName) {
        this.active = true;
        this.shipName = shipName != null ? shipName : "";
    }

    public void clearActive() {
        this.active = false;
        this.shipName = "";
        inputN = inputS = inputE = inputW = false;
        inputRise = inputLower = inputBoost = false;
        speed = 0f;
        heading = 0f;
        altitude = 0;
    }

    public void setInputState(boolean n, boolean s, boolean e, boolean w,
                              boolean rise, boolean lower, boolean boost) {
        this.inputN = n;
        this.inputS = s;
        this.inputE = e;
        this.inputW = w;
        this.inputRise = rise;
        this.inputLower = lower;
        this.inputBoost = boost;
    }

    public void setTelemetry(float speed, float heading, int altitude) {
        this.speed = speed;
        this.heading = heading;
        this.altitude = altitude;
    }

    public void setHealth(float health, float maxHealth) {
        this.health = health;
        this.maxHealth = maxHealth;
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

        if (!shipName.isEmpty()) {
            String nameText = "§l" + shipName;
            int nameWidth = client.textRenderer.getWidth(nameText);
            context.drawText(client.textRenderer, Text.of(nameText),
                    (screenWidth - nameWidth) / 2, 10, 0xFFFFFF, true);
        }

        int compassCenterX = screenWidth / 2;
        int compassCenterY = screenHeight - 50;
        int spacing = 14;

        context.fill(compassCenterX - 28, compassCenterY - 22,
                compassCenterX + 28, compassCenterY + 22, 0x80000000);

        int activeColor = 0xFFFFCC00;
        int inactiveColor = 0xFF888888;
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

        int vertX = compassCenterX + 50;
        context.fill(vertX - 12, compassCenterY - 22, vertX + 12, compassCenterY + 22, 0x80000000);
        drawCenteredChar(context, client, "▲", vertX, compassCenterY - spacing,
                inputRise ? activeColor : inactiveColor);
        drawCenteredChar(context, client, "Y", vertX, compassCenterY - 4,
                inputBoost ? 0xFFFF6633 : inactiveColor);
        drawCenteredChar(context, client, "▼", vertX, compassCenterY + spacing - 8,
                inputLower ? activeColor : inactiveColor);

        String telemetry = String.format("SPD %.1f  ALT %d  HDG %03d°",
                speed, altitude, ((int) ((heading % 360) + 360)) % 360);
        int telWidth = client.textRenderer.getWidth(telemetry);
        context.drawText(client.textRenderer, Text.of("§e" + telemetry),
                (screenWidth - telWidth) / 2, screenHeight - 78, 0xFFFFFFFF, true);

        int barW = 120;
        int barH = 6;
        int barX = (screenWidth - barW) / 2;
        int barY = screenHeight - 66;
        float ratio = maxHealth > 0 ? Math.max(0f, Math.min(1f, health / maxHealth)) : 0f;
        int fillW = (int) (barW * ratio);
        int hpColor = ratio > 0.5f ? 0xFF44CC44 : (ratio > 0.25f ? 0xFFCCAA22 : 0xFFCC2222);
        context.fill(barX - 1, barY - 1, barX + barW + 1, barY + barH + 1, 0xFF000000);
        context.fill(barX, barY, barX + barW, barY + barH, 0xFF333333);
        if (fillW > 0) context.fill(barX, barY, barX + fillW, barY + barH, hpColor);
        String hpText = String.format("HULL %.0f / %.0f", health, maxHealth);
        int hpW = client.textRenderer.getWidth(hpText);
        context.drawText(client.textRenderer, Text.of("§f" + hpText),
                (screenWidth - hpW) / 2, barY - 10, 0xFFFFFFFF, true);

        if (inputBoost && speed > 0) {
            String boostTag = "§6§lBOOST";
            int bw = client.textRenderer.getWidth(boostTag);
            context.drawText(client.textRenderer, Text.of(boostTag),
                    (screenWidth - bw) / 2, screenHeight - 90, 0xFFFFAA00, true);
        }

        String controls = "WASD Move  Space Up  Tab Down  Ctrl Boost  Shift Dismount";
        int controlsWidth = client.textRenderer.getWidth(controls);
        context.drawText(client.textRenderer, Text.of("§7" + controls),
                screenWidth - controlsWidth - 10, screenHeight - 15, 0x999999, true);
    }

    private static void drawCenteredChar(DrawContext context, MinecraftClient client,
                                         String ch, int x, int y, int color) {
        int w = client.textRenderer.getWidth(ch);
        context.drawText(client.textRenderer, Text.of("§l" + ch), x - w / 2, y, color, true);
    }
}
