package com.kbve.mcuplink.mixin;

import com.kbve.mcuplink.KbveMcUplink;
import net.minecraft.advancement.AdvancementDisplay;
import net.minecraft.advancement.AdvancementEntry;
import net.minecraft.advancement.PlayerAdvancementTracker;
import net.minecraft.server.network.ServerPlayerEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import java.util.Optional;

/**
 * Hook on {@code PlayerAdvancementTracker#grantCriterion} that fires after a
 * criterion is granted. When the criterion completion actually unlocks the
 * advancement (return value {@code true}) AND the advancement is configured
 * to announce in chat, forward an event upstream to the Velocity relay.
 *
 * Fabric API has no public callback for "advancement earned", only criterion
 * progression on {@code ServerPlayerEvents.AFTER_RESPAWN} etc. — a tiny
 * mixin is the cleanest path.
 */
@Mixin(PlayerAdvancementTracker.class)
public abstract class PlayerAdvancementTrackerMixin {

    /** Yarn-mapped {@code owner} field on PlayerAdvancementTracker. */
    @Accessor("owner")
    public abstract ServerPlayerEntity kbveMcUplink$getOwner();

    @Inject(method = "grantCriterion", at = @At("RETURN"))
    private void kbveMcUplink$onGrant(
            AdvancementEntry advancement,
            String criterionName,
            CallbackInfoReturnable<Boolean> cir
    ) {
        if (cir.getReturnValue() != Boolean.TRUE) return;
        Optional<AdvancementDisplay> display = advancement.value().display();
        if (display.isEmpty()) return;
        if (!display.get().shouldAnnounceToChat()) return;

        ServerPlayerEntity player = kbveMcUplink$getOwner();
        if (player == null) return;

        String title = display.get().getTitle().getString();
        String key = advancement.id().toString();
        KbveMcUplink.onAdvancement(player, title, key);
    }
}
