package com.kbve.statetree.client;

import com.kbve.statetree.ship.ShipInventory;
import com.kbve.statetree.ship.ShipScreenHandler;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.ingame.HandledScreen;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.text.Text;

/**
 * Code-drawn GUI for the ship inventory. Pure {@link DrawContext} fills —
 * no .png assets, no texture atlases — so the screen ships clean of
 * any third-party art licensing.
 *
 * <p>Visual hierarchy:
 * <ul>
 *   <li>Outer beveled panel (lighter top/left, darker bottom/right)</li>
 *   <li>Per-section accent strips behind the slot row</li>
 *   <li>Beveled slot frames with section-tinted insets</li>
 *   <li>Subtle horizontal divider before player inventory</li>
 * </ul>
 */
public class ShipScreen extends HandledScreen<ShipScreenHandler> {

    private static final int PANEL_FILL    = 0xFF1B2128;
    private static final int PANEL_HILIGHT = 0xFF3A4452;
    private static final int PANEL_SHADOW  = 0xFF0A0E12;
    private static final int PANEL_BORDER  = 0xFF44505E;

    private static final int ACCENT_FILL   = 0xFF252D38;

    private static final int SLOT_BG       = 0xFF0E1116;
    private static final int SLOT_BORDER   = 0xFF3F4954;
    private static final int SLOT_HILIGHT  = 0x40FFFFFF;
    private static final int SLOT_SHADOW   = 0x60000000;

    private static final int TINT_UPGRADE  = 0x602A4A88;
    private static final int TINT_BANNER   = 0x60883078;
    private static final int TINT_FUEL     = 0x60AA6020;
    private static final int TINT_WEAPON   = 0x60882828;
    private static final int TINT_CARGO    = 0x402F3742;
    private static final int TINT_PLAYER   = 0x301F242C;

    private static final int LABEL_COLOR   = 0xFFEACE76;
    private static final int LABEL_DIM     = 0xFF8A95A0;

    public ShipScreen(ShipScreenHandler handler, PlayerInventory inv, Text title) {
        super(handler, inv, title);
        this.backgroundWidth = 210;
        this.backgroundHeight = 208;
        this.playerInventoryTitleY = this.backgroundHeight - 94;
    }

    @Override
    protected void drawBackground(DrawContext ctx, float delta, int mouseX, int mouseY) {
        int x = (this.width - this.backgroundWidth) / 2;
        int y = (this.height - this.backgroundHeight) / 2;
        int w = this.backgroundWidth;
        int h = this.backgroundHeight;

        beveledPanel(ctx, x, y, w, h);

        ctx.fill(x + 4, y + 14, x + w - 4, y + 38, ACCENT_FILL);

        ctx.fill(x + 58, y + 40, x + 134, y + 116, ACCENT_FILL);

        ctx.fill(x + 4, y + 122, x + w - 4, y + 200, ACCENT_FILL);

        ctx.fill(x + 6, y + 119, x + w - 6, y + 121, PANEL_BORDER);

        int sy = y + 18;
        for (int i = 0; i < ShipInventory.UPGRADE_COUNT; i++) {
            slotFrame(ctx, x + 8 + i * 18, sy, TINT_UPGRADE);
        }
        slotFrame(ctx, x + 88, sy, TINT_BANNER);
        slotFrame(ctx, x + 108, sy, TINT_FUEL);
        for (int i = 0; i < ShipInventory.WEAPON_COUNT; i++) {
            slotFrame(ctx, x + 128 + i * 18, sy, TINT_WEAPON);
        }

        for (int row = 0; row < 4; row++) {
            for (int col = 0; col < 4; col++) {
                slotFrame(ctx, x + 62 + col * 18, y + 44 + row * 18, TINT_CARGO);
            }
        }

        int py0 = y + 126;
        for (int row = 0; row < 3; row++) {
            for (int col = 0; col < 9; col++) {
                slotFrame(ctx, x + 8 + col * 18, py0 + row * 18, TINT_PLAYER);
            }
        }
        for (int col = 0; col < 9; col++) {
            slotFrame(ctx, x + 8 + col * 18, py0 + 58, TINT_PLAYER);
        }
    }

    @Override
    protected void drawForeground(DrawContext ctx, int mouseX, int mouseY) {
        ctx.drawText(this.textRenderer, Text.literal("UPGRADES"), 8, 8, LABEL_COLOR, true);
        ctx.drawText(this.textRenderer, Text.literal("BNR"), 87, 8, LABEL_COLOR, true);
        ctx.drawText(this.textRenderer, Text.literal("FUEL"), 105, 8, LABEL_COLOR, true);
        ctx.drawText(this.textRenderer, Text.literal("WEAPONS"), 128, 8, LABEL_COLOR, true);
        ctx.drawText(this.textRenderer, Text.literal("CARGO"), 62, 34, LABEL_COLOR, true);

        ctx.drawText(this.textRenderer, this.title,
                this.titleX, this.titleY, 0xFFFFFFFF, true);
        ctx.drawText(this.textRenderer, this.playerInventoryTitle,
                this.playerInventoryTitleX, this.playerInventoryTitleY, LABEL_DIM, false);
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        this.renderBackground(ctx, mouseX, mouseY, delta);
        super.render(ctx, mouseX, mouseY, delta);
        this.drawMouseoverTooltip(ctx, mouseX, mouseY);
    }

    /** 1-pixel beveled outer panel: highlight top/left, shadow bottom/right. */
    private static void beveledPanel(DrawContext ctx, int x, int y, int w, int h) {
        ctx.fill(x + 1, y + 1, x + w + 1, y + h + 1, PANEL_SHADOW);
        ctx.fill(x - 1, y - 1, x + w + 1, y + h + 1, PANEL_BORDER);
        ctx.fill(x, y, x + w, y + h, PANEL_FILL);
        ctx.fill(x, y, x + w, y + 1, PANEL_HILIGHT);
        ctx.fill(x, y, x + 1, y + h, PANEL_HILIGHT);
        ctx.fill(x, y + h - 1, x + w, y + h, PANEL_SHADOW);
        ctx.fill(x + w - 1, y, x + w, y + h, PANEL_SHADOW);
    }

    /**
     * Beveled 16×16 slot frame with a section-tinted inset.
     * Slot origin (x,y) matches vanilla's Slot.x / Slot.y so vanilla's
     * own item rendering lines up.
     */
    private static void slotFrame(DrawContext ctx, int x, int y, int tint) {
        ctx.fill(x - 1, y - 1, x + 17, y + 17, SLOT_BORDER);
        ctx.fill(x, y, x + 16, y + 16, SLOT_BG);
        ctx.fill(x, y, x + 16, y + 16, tint);
        ctx.fill(x - 1, y - 1, x + 17, y, SLOT_HILIGHT);
        ctx.fill(x - 1, y - 1, x, y + 17, SLOT_HILIGHT);
        ctx.fill(x - 1, y + 16, x + 17, y + 17, SLOT_SHADOW);
        ctx.fill(x + 16, y - 1, x + 17, y + 17, SLOT_SHADOW);
    }
}
