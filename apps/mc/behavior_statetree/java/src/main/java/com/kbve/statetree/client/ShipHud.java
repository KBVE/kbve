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
    private float climbRate = 0f;
    private int aglMeters = 0;
    private float health = 100f;
    private float maxHealth = 100f;
    private float fuel = 0f;
    private float maxFuel = 1000f;
    private float enginePower = 0f;
    private boolean fuelLow = false;
    private int upgradeCount = 0;
    private int maxUpgradeSlots = 4;
    private byte cautionBits = 0;
    private String flightMode = "FLY";
    private float boostReserve = 1f;

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
        fuel = 0f;
        enginePower = 0f;
        fuelLow = false;
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

    public void setClimbRate(float verticalVelocity) {
        // Convert blocks/tick to blocks/sec for a more familiar readout.
        this.climbRate = verticalVelocity * 20f;
    }

    public void setAgl(int aglMeters) {
        this.aglMeters = aglMeters;
    }

    public void setHealth(float health, float maxHealth) {
        this.health = health;
        this.maxHealth = maxHealth;
    }

    public void setFuel(float fuel, float maxFuel, boolean low) {
        this.fuel = fuel;
        this.maxFuel = maxFuel;
        this.fuelLow = low;
    }

    public void setEnginePower(float enginePower) {
        this.enginePower = enginePower;
    }

    public void setUpgrades(int count, int maxSlots) {
        this.upgradeCount = count;
        this.maxUpgradeSlots = maxSlots;
    }

    public void setCautions(byte bits) {
        this.cautionBits = bits;
    }

    public void setFlightMode(String mode) {
        this.flightMode = mode;
    }

    public void setBoostReserve(float reserve) {
        this.boostReserve = reserve;
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

        int cx = screenWidth / 2;
        int cy = screenHeight / 2;
        int crossColor = 0xFFFFFFFF;
        context.fill(cx - 6, cy, cx - 1, cy + 1, crossColor);
        context.fill(cx + 2, cy, cx + 7, cy + 1, crossColor);
        context.fill(cx, cy - 6, cx + 1, cy - 1, crossColor);
        context.fill(cx, cy + 2, cx + 1, cy + 7, crossColor);
        context.fill(cx - 1, cy - 1, cx + 2, cy + 2, 0x80000000);

        if (!shipName.isEmpty()) {
            String modeColor = switch (flightMode) {
                case "HOVER" -> "§b";
                case "GROUND" -> "§7";
                case "STALL" -> "§c";
                default -> "§a";
            };
            String nameText = "§l" + shipName + " " + modeColor + "§l[" + flightMode + "]";
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

        String climbStr = climbRate >= 0
                ? String.format("§a▲%.1f", climbRate)
                : String.format("§c▼%.1f", -climbRate);
        // Speed color: green cruise → yellow sprint → red boost.
        String spdColor = speed > 1.2f ? "§c" : (speed > 0.7f ? "§e" : "§a");
        // AGL color — red if low (< 8), yellow if borderline (< 16), white otherwise.
        String aglColor = aglMeters < 8 ? "§c" : (aglMeters < 16 ? "§e" : "§f");
        String telemetry = String.format(
                "%sSPD %.1f§r  §7ALT§f %d  %sAGL %d§r  §7HDG§f %03d°  %s",
                spdColor, speed,
                altitude, aglColor, aglMeters,
                ((int) ((heading % 360) + 360)) % 360, climbStr);
        int telWidth = client.textRenderer.getWidth(telemetry);
        context.drawText(client.textRenderer, Text.of(telemetry),
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

        // Engine power gauge — orange bar above hull.
        int engY = barY - 20;
        int engFillW = (int) (barW * Math.max(0f, Math.min(1f, enginePower)));
        context.fill(barX - 1, engY - 1, barX + barW + 1, engY + barH + 1, 0xFF000000);
        context.fill(barX, engY, barX + barW, engY + barH, 0xFF333333);
        if (engFillW > 0) context.fill(barX, engY, barX + engFillW, engY + barH, 0xFFFF8822);

        // Boost reservoir — narrow strip on top of engine bar (purple).
        int boostFillW = (int) (barW * Math.max(0f, Math.min(1f, boostReserve)));
        int boostColor = boostReserve <= 0.05f ? 0xFFCC2222 : 0xFFAA22DD;
        context.fill(barX, engY - 4, barX + barW, engY - 1, 0xFF111111);
        if (boostFillW > 0) context.fill(barX, engY - 4, barX + boostFillW, engY - 1, boostColor);

        // Fuel gauge — yellow bar above engine. Flashes red when low.
        int fuelY = engY - 14;
        float fuelRatio = maxFuel > 0 ? Math.max(0f, Math.min(1f, fuel / maxFuel)) : 0f;
        int fuelFillW = (int) (barW * fuelRatio);
        int fuelColor;
        if (fuel <= 0f) {
            fuelColor = 0xFFCC2222;
        } else if (fuelLow) {
            fuelColor = ((System.currentTimeMillis() / 250) % 2 == 0) ? 0xFFFF4444 : 0xFFCC8822;
        } else {
            fuelColor = 0xFFFFCC22;
        }
        context.fill(barX - 1, fuelY - 1, barX + barW + 1, fuelY + barH + 1, 0xFF000000);
        context.fill(barX, fuelY, barX + barW, fuelY + barH, 0xFF333333);
        if (fuelFillW > 0) context.fill(barX, fuelY, barX + fuelFillW, fuelY + barH, fuelColor);
        String fuelText = String.format("FUEL %.0f / %.0f", fuel, maxFuel);
        int fuelTextW = client.textRenderer.getWidth(fuelText);
        context.drawText(client.textRenderer, Text.of((fuelLow ? "§c" : "§f") + fuelText),
                (screenWidth - fuelTextW) / 2, fuelY - 10, 0xFFFFFFFF, true);

        // Low-fuel + empty warnings centered up top.
        if (fuel <= 0f) {
            String warn = "§c§lOUT OF FUEL — REFUEL WITH COAL OR LAVA BUCKET";
            int ww = client.textRenderer.getWidth(warn);
            context.drawText(client.textRenderer, Text.of(warn),
                    (screenWidth - ww) / 2, 30, 0xFFFF2222, true);
        } else if (fuelLow && (System.currentTimeMillis() / 500) % 2 == 0) {
            String warn = "§e§lLOW FUEL";
            int ww = client.textRenderer.getWidth(warn);
            context.drawText(client.textRenderer, Text.of(warn),
                    (screenWidth - ww) / 2, 30, 0xFFFFAA22, true);
        }

        if (inputBoost && speed > 0) {
            String boostTag = "§6§lBOOST";
            int bw = client.textRenderer.getWidth(boostTag);
            context.drawText(client.textRenderer, Text.of(boostTag),
                    (screenWidth - bw) / 2, screenHeight - 105, 0xFFFFAA00, true);
        }

        String controls = "Mouse Aim  W Throttle  Space Up  C Down  Ctrl Boost  Shift Dismount";
        int controlsWidth = client.textRenderer.getWidth(controls);
        context.drawText(client.textRenderer, Text.of("§7" + controls),
                screenWidth - controlsWidth - 10, screenHeight - 15, 0x999999, true);

        // Upgrade slots indicator (top-left).
        String upgText = String.format("§bUPGRADES %d/%d", upgradeCount, maxUpgradeSlots);
        context.drawText(client.textRenderer, Text.of(upgText),
                10, 10, 0xFFFFFFFF, true);

        // Cautions stack (just above the controls hint, right side).
        // Mirrors IA's PULL_UP / VOID / DAMAGED indicators; LOW_FUEL is
        // already shown via the fuel bar, but it's mirrored here as a
        // pulsing red word for parity at a glance.
        boolean blink = (System.currentTimeMillis() / 300) % 2 == 0;
        int row = 0;
        if ((cautionBits & 0x1) != 0) { // PULL_UP
            String t = "§4§lPULL UP";
            context.drawText(client.textRenderer, Text.of(t),
                    screenWidth - client.textRenderer.getWidth(t) - 10,
                    30 + row * 12, blink ? 0xFFFF3333 : 0xFFAA0000, true);
            row++;
        }
        if ((cautionBits & 0x2) != 0) { // VOID
            String t = "§4§lVOID";
            context.drawText(client.textRenderer, Text.of(t),
                    screenWidth - client.textRenderer.getWidth(t) - 10,
                    30 + row * 12, blink ? 0xFFFF3333 : 0xFFAA0000, true);
            row++;
        }
        if ((cautionBits & 0x4) != 0) { // DAMAGED
            String t = "§c§lDAMAGED";
            context.drawText(client.textRenderer, Text.of(t),
                    screenWidth - client.textRenderer.getWidth(t) - 10,
                    30 + row * 12, blink ? 0xFFFF6666 : 0xFFCC2222, true);
            row++;
        }
        if ((cautionBits & 0x8) != 0 && fuel > 0f) { // LOW_FUEL (out-of-fuel handled elsewhere)
            String t = "§e§lLOW FUEL";
            context.drawText(client.textRenderer, Text.of(t),
                    screenWidth - client.textRenderer.getWidth(t) - 10,
                    30 + row * 12, blink ? 0xFFFFCC22 : 0xFFAA8800, true);
        }
    }

    private static void drawCenteredChar(DrawContext context, MinecraftClient client,
                                         String ch, int x, int y, int color) {
        int w = client.textRenderer.getWidth(ch);
        context.drawText(client.textRenderer, Text.of("§l" + ch), x - w / 2, y, color, true);
    }
}
