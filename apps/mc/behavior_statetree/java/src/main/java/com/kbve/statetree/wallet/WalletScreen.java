package com.kbve.statetree.wallet;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.ingame.HandledScreen;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

import java.text.NumberFormat;
import java.util.Locale;

public class WalletScreen extends HandledScreen<WalletScreenHandler> {

    private static final int BG_WIDTH = 220;
    private static final int BG_HEIGHT = 156;

    public WalletScreen(WalletScreenHandler handler, PlayerInventory inv, Text title) {
        super(handler, inv, title);
        this.backgroundWidth = BG_WIDTH;
        this.backgroundHeight = BG_HEIGHT;
    }

    @Override
    protected void drawBackground(DrawContext ctx, float delta, int mouseX, int mouseY) {
        int x = (this.width - this.backgroundWidth) / 2;
        int y = (this.height - this.backgroundHeight) / 2;
        ctx.fill(x, y, x + backgroundWidth, y + backgroundHeight, 0xFF1B1B1F);
        ctx.fill(x + 2, y + 2, x + backgroundWidth - 2, y + backgroundHeight - 2, 0xFF2A2A33);
        ctx.fill(x + 2, y + 2, x + backgroundWidth - 2, y + 22, 0xFF3F3F4A);
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        this.renderBackground(ctx, mouseX, mouseY, delta);
        super.render(ctx, mouseX, mouseY, delta);
    }

    @Override
    protected void drawForeground(DrawContext ctx, int mouseX, int mouseY) {
        int titleColor = 0xFFFFD66B;
        int valueColor = 0xFFFFFFFF;
        int labelColor = 0xFFA0A0B0;

        ctx.drawText(this.textRenderer, Text.literal("KBVE Wallet").formatted(Formatting.GOLD), 10, 8, titleColor, false);

        long credits = handler.getCredits();
        long khash = handler.getKhash();

        ctx.drawText(this.textRenderer, Text.literal("Credits"), 14, 36, labelColor, false);
        ctx.drawText(this.textRenderer, Text.literal(format(credits)).formatted(Formatting.YELLOW),
                14, 50, valueColor, false);

        ctx.drawText(this.textRenderer, Text.literal("KHash"), 14, 74, labelColor, false);
        ctx.drawText(this.textRenderer, Text.literal(format(khash)).formatted(Formatting.AQUA),
                14, 88, valueColor, false);

        ctx.drawText(this.textRenderer, Text.literal("Merchant — coming soon").formatted(Formatting.GRAY),
                14, 120, labelColor, false);
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    private static String format(long v) {
        return NumberFormat.getInstance(Locale.US).format(v);
    }
}
