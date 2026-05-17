package com.kbve.statetree.mixin.client;

import com.kbve.statetree.wallet.ClientWalletState;
import com.kbve.statetree.wallet.WalletOpenPayload;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.ingame.HandledScreen;
import net.minecraft.client.gui.screen.ingame.InventoryScreen;
import net.minecraft.client.gui.tooltip.Tooltip;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.screen.PlayerScreenHandler;
import net.minecraft.text.MutableText;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import java.text.NumberFormat;
import java.util.Locale;

@Mixin(InventoryScreen.class)
public abstract class InventoryScreenMixin extends HandledScreen<PlayerScreenHandler> {

    private static final int BTN_SIZE = 18;
    private static final int BTN_OFFSET_X = 4;
    private static final int BTN_OFFSET_Y = 0;

    private InventoryScreenMixin(PlayerScreenHandler h, PlayerInventory inv, Text title) {
        super(h, inv, title);
    }

    @Inject(method = "init", at = @At("TAIL"))
    private void kbve_addWalletButton(CallbackInfo ci) {
        int btnX = this.x + this.backgroundWidth + BTN_OFFSET_X;
        int btnY = this.y + BTN_OFFSET_Y;
        ButtonWidget btn = ButtonWidget.builder(
                        Text.literal("$").formatted(Formatting.GOLD, Formatting.BOLD),
                        (b) -> {
                            if (ClientPlayNetworking.canSend(WalletOpenPayload.ID)) {
                                ClientPlayNetworking.send(new WalletOpenPayload((byte) 1));
                            }
                        })
                .dimensions(btnX, btnY, BTN_SIZE, BTN_SIZE)
                .tooltip(Tooltip.of(buildTooltip()))
                .build();
        this.addDrawableChild(btn);
    }

    @Inject(method = "render", at = @At("TAIL"))
    private void kbve_drawBalanceWidget(DrawContext ctx, int mouseX, int mouseY, float delta, CallbackInfo ci) {
        if (!ClientWalletState.isPopulated()) return;

        int boxX = this.x + this.backgroundWidth + BTN_OFFSET_X;
        int boxY = this.y + BTN_OFFSET_Y + BTN_SIZE + 4;
        int boxW = 96;
        int boxH = 38;

        ctx.fill(boxX, boxY, boxX + boxW, boxY + boxH, 0xC8000000);
        ctx.fill(boxX, boxY, boxX + boxW, boxY + 1, 0xFF606060);
        ctx.fill(boxX, boxY + boxH - 1, boxX + boxW, boxY + boxH, 0xFF606060);
        ctx.fill(boxX, boxY, boxX + 1, boxY + boxH, 0xFF606060);
        ctx.fill(boxX + boxW - 1, boxY, boxX + boxW, boxY + boxH, 0xFF606060);

        ctx.drawTextWithShadow(this.textRenderer,
                Text.literal("Credits").formatted(Formatting.YELLOW),
                boxX + 4, boxY + 4, 0xFFFFFFFF);
        ctx.drawTextWithShadow(this.textRenderer,
                Text.literal(format(ClientWalletState.credits())).formatted(Formatting.WHITE),
                boxX + 4, boxY + 14, 0xFFFFFFFF);
        ctx.drawTextWithShadow(this.textRenderer,
                Text.literal("KHash").formatted(Formatting.AQUA),
                boxX + 48, boxY + 4, 0xFFFFFFFF);
        ctx.drawTextWithShadow(this.textRenderer,
                Text.literal(format(ClientWalletState.khash())).formatted(Formatting.WHITE),
                boxX + 48, boxY + 14, 0xFFFFFFFF);
    }

    private static Text buildTooltip() {
        if (!ClientWalletState.isPopulated()) {
            return Text.literal("Wallet").formatted(Formatting.GOLD);
        }
        MutableText t = Text.literal("Wallet\n").formatted(Formatting.GOLD)
                .append(Text.literal("Credits: ").formatted(Formatting.YELLOW))
                .append(Text.literal(format(ClientWalletState.credits()) + "\n").formatted(Formatting.WHITE))
                .append(Text.literal("KHash: ").formatted(Formatting.AQUA))
                .append(Text.literal(format(ClientWalletState.khash())).formatted(Formatting.WHITE));
        return t;
    }

    private static String format(long v) {
        return NumberFormat.getInstance(Locale.US).format(v);
    }
}
