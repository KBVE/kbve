package com.kbve.statetree.wallet;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.ingame.HandledScreen;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

import java.text.NumberFormat;
import java.util.Locale;

public class WalletScreen extends HandledScreen<WalletScreenHandler> {

    private static final int BG_WIDTH = 224;
    private static final int BG_HEIGHT = 166;

    private static final int COLOR_BORDER_DARK = 0xFF373737;
    private static final int COLOR_BORDER_LIGHT = 0xFFFFFFFF;
    private static final int COLOR_BG_BASE = 0xFFC6C6C6;
    private static final int COLOR_BG_INSET_DARK = 0xFF8B8B8B;
    private static final int COLOR_BG_INSET_LIGHT = 0xFFFFFFFF;
    private static final int COLOR_TITLE_STRIP = 0xFF555555;
    private static final int COLOR_DIVIDER = 0xFF8B8B8B;
    private static final int COLOR_TEXT_DARK = 0xFF404040;

    private static final ItemStack CREDITS_ICON = new ItemStack(Items.GOLD_INGOT);
    private static final ItemStack KHASH_ICON = new ItemStack(Items.EMERALD);
    private static final ItemStack MERCHANT_ICON = new ItemStack(Items.WRITABLE_BOOK);

    public WalletScreen(WalletScreenHandler handler, PlayerInventory inv, Text title) {
        super(handler, inv, title);
        this.backgroundWidth = BG_WIDTH;
        this.backgroundHeight = BG_HEIGHT;
    }

    @Override
    protected void drawBackground(DrawContext ctx, float delta, int mouseX, int mouseY) {
        int x = (this.width - this.backgroundWidth) / 2;
        int y = (this.height - this.backgroundHeight) / 2;

        drawBeveledPanel(ctx, x, y, BG_WIDTH, BG_HEIGHT, COLOR_BG_BASE, COLOR_BORDER_LIGHT, COLOR_BORDER_DARK);

        ctx.fill(x + 4, y + 4, x + BG_WIDTH - 4, y + 22, COLOR_TITLE_STRIP);
        ctx.fill(x + 4, y + 22, x + BG_WIDTH - 4, y + 24, COLOR_BORDER_DARK);

        drawInsetPanel(ctx, x + 6, y + 30, BG_WIDTH - 12, 24);
        drawInsetPanel(ctx, x + 6, y + 60, BG_WIDTH - 12, 24);

        ctx.fill(x + 6, y + 94, x + BG_WIDTH - 6, y + 95, COLOR_DIVIDER);

        drawInsetPanel(ctx, x + 6, y + 102, BG_WIDTH - 12, 22);
    }

    private static void drawBeveledPanel(DrawContext ctx, int x, int y, int w, int h, int fill, int light, int dark) {
        ctx.fill(x, y, x + w, y + h, fill);
        ctx.fill(x, y, x + w, y + 1, light);
        ctx.fill(x, y, x + 1, y + h, light);
        ctx.fill(x + w - 1, y, x + w, y + h, dark);
        ctx.fill(x, y + h - 1, x + w, y + h, dark);
    }

    private static void drawInsetPanel(DrawContext ctx, int x, int y, int w, int h) {
        ctx.fill(x, y, x + w, y + h, COLOR_BG_INSET_DARK);
        ctx.fill(x, y, x + w, y + 1, COLOR_BORDER_DARK);
        ctx.fill(x, y, x + 1, y + h, COLOR_BORDER_DARK);
        ctx.fill(x + w - 1, y, x + w, y + h, COLOR_BG_INSET_LIGHT);
        ctx.fill(x, y + h - 1, x + w, y + h, COLOR_BG_INSET_LIGHT);
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        this.renderBackground(ctx, mouseX, mouseY, delta);
        super.render(ctx, mouseX, mouseY, delta);
        renderIcons(ctx);
    }

    private void renderIcons(DrawContext ctx) {
        int x = (this.width - this.backgroundWidth) / 2;
        int y = (this.height - this.backgroundHeight) / 2;
        ctx.drawItem(CREDITS_ICON, x + 10, y + 34);
        ctx.drawItem(KHASH_ICON, x + 10, y + 64);
        ctx.drawItem(MERCHANT_ICON, x + 10, y + 104);
    }

    @Override
    protected void drawForeground(DrawContext ctx, int mouseX, int mouseY) {
        ctx.drawText(this.textRenderer,
                Text.literal("KBVE Wallet").formatted(Formatting.GOLD, Formatting.BOLD),
                10, 9, 0xFFFFD66B, true);

        long credits = handler.getCredits();
        long khash = handler.getKhash();

        ctx.drawText(this.textRenderer,
                Text.literal("Credits").formatted(Formatting.DARK_GRAY),
                32, 33, COLOR_TEXT_DARK, false);
        ctx.drawText(this.textRenderer,
                Text.literal(format(credits)).formatted(Formatting.YELLOW),
                32, 45, 0xFFFFFFFF, true);

        ctx.drawText(this.textRenderer,
                Text.literal("KHash").formatted(Formatting.DARK_GRAY),
                32, 63, COLOR_TEXT_DARK, false);
        ctx.drawText(this.textRenderer,
                Text.literal(format(khash)).formatted(Formatting.AQUA),
                32, 75, 0xFFFFFFFF, true);

        ctx.drawText(this.textRenderer,
                Text.literal("Merchant — coming soon").formatted(Formatting.GRAY, Formatting.ITALIC),
                32, 108, COLOR_TEXT_DARK, false);
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    private static String format(long v) {
        return NumberFormat.getInstance(Locale.US).format(v);
    }
}
