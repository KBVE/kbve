package com.kbve.statetree.client;

import com.kbve.statetree.ship.ShipInventory;
import com.kbve.statetree.ship.ShipScreenHandler;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.ingame.HandledScreen;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.text.Text;

/**
 * Code-drawn GUI for the ship inventory. No texture asset — slots are
 * outlined with simple {@code DrawContext.fill} calls so the screen
 * works without ship-specific {@code .png} files in {@code assets/}.
 */
public class ShipScreen extends HandledScreen<ShipScreenHandler> {

    private static final int BG_COLOR = 0xFF202828;
    private static final int BG_BORDER = 0xFF505860;
    private static final int SLOT_BG = 0xFF101414;
    private static final int LABEL_COLOR = 0xFFFFCC44;

    public ShipScreen(ShipScreenHandler handler, PlayerInventory inv, Text title) {
        super(handler, inv, title);
        this.backgroundWidth = 192;
        this.backgroundHeight = 208;
        this.playerInventoryTitleY = this.backgroundHeight - 94;
    }

    @Override
    protected void drawBackground(DrawContext ctx, float delta, int mouseX, int mouseY) {
        int x = (this.width - this.backgroundWidth) / 2;
        int y = (this.height - this.backgroundHeight) / 2;

        // Outer panel
        ctx.fill(x - 1, y - 1, x + this.backgroundWidth + 1, y + this.backgroundHeight + 1, BG_BORDER);
        ctx.fill(x, y, x + this.backgroundWidth, y + this.backgroundHeight, BG_COLOR);

        // Slot backgrounds — match handler.layoutSlots positions.
        int sy = y + 18;
        for (int i = 0; i < ShipInventory.UPGRADE_COUNT; i++) {
            int sx = x + 8 + i * 18;
            slotBg(ctx, sx, sy);
        }
        slotBg(ctx, x + 88, sy);
        for (int i = 0; i < ShipInventory.WEAPON_COUNT; i++) {
            int sx = x + 116 + i * 18;
            slotBg(ctx, sx, sy);
        }

        // Storage 4x4
        int gx0 = x + 62;
        int gy0 = y + 44;
        for (int row = 0; row < 4; row++) {
            for (int col = 0; col < 4; col++) {
                slotBg(ctx, gx0 + col * 18, gy0 + row * 18);
            }
        }

        // Player inventory 3x9 + hotbar
        int py0 = y + 126;
        for (int row = 0; row < 3; row++) {
            for (int col = 0; col < 9; col++) {
                slotBg(ctx, x + 8 + col * 18, py0 + row * 18);
            }
        }
        for (int col = 0; col < 9; col++) {
            slotBg(ctx, x + 8 + col * 18, py0 + 58);
        }
    }

    @Override
    protected void drawForeground(DrawContext ctx, int mouseX, int mouseY) {
        // Section labels.
        ctx.drawText(this.textRenderer, Text.literal("Upgrades"), 8, 8, LABEL_COLOR, false);
        ctx.drawText(this.textRenderer, Text.literal("Banner"), 88, 8, LABEL_COLOR, false);
        ctx.drawText(this.textRenderer, Text.literal("Weapons"), 116, 8, LABEL_COLOR, false);
        ctx.drawText(this.textRenderer, Text.literal("Cargo"), 62, 34, LABEL_COLOR, false);

        // Title
        ctx.drawText(this.textRenderer, this.title, this.titleX, this.titleY, 0xFFFFFFFF, false);
        ctx.drawText(this.textRenderer, this.playerInventoryTitle,
                this.playerInventoryTitleX, this.playerInventoryTitleY, 0xFFAAAAAA, false);
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        this.renderBackground(ctx, mouseX, mouseY, delta);
        super.render(ctx, mouseX, mouseY, delta);
        this.drawMouseoverTooltip(ctx, mouseX, mouseY);
    }

    private static void slotBg(DrawContext ctx, int x, int y) {
        ctx.fill(x - 1, y - 1, x + 17, y + 17, BG_BORDER);
        ctx.fill(x, y, x + 16, y + 16, SLOT_BG);
    }
}
