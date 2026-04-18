package com.kbve.statetree.command;

import net.minecraft.block.Blocks;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.projectile.ArrowEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.EnumMap;
import java.util.Map;

/**
 * Registry-backed applier for mob-scoped commands. Each command kind maps
 * to a typed {@link CommandApplier} — no if/else chain.
 */
public final class MobCommandApplier {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    @SuppressWarnings("rawtypes")
    private final Map<CommandKind, CommandApplier> registry = new EnumMap<>(CommandKind.class);

    public MobCommandApplier() {
        register(CommandKind.MOVE_TO, this::applyMoveTo);
        register(CommandKind.ATTACK, this::applyAttack);
        register(CommandKind.IDLE, this::applyIdle);
        register(CommandKind.SPEAK, this::applySpeak);
        register(CommandKind.CALL_FOR_HELP, this::applyCallForHelp);
        register(CommandKind.POOP_POISON, this::applyPoopPoison);
        register(CommandKind.PLACE_BLOCK, this::applyPlaceBlock);
        register(CommandKind.TELEPORT, this::applyTeleport);
        register(CommandKind.SHOOT_ARROW, this::applyShootArrow);
        register(CommandKind.SET_GOAL, this::applySetGoal);
    }

    private <T extends AiCommand> void register(CommandKind kind, CommandApplier<T> applier) {
        registry.put(kind, applier);
    }

    @SuppressWarnings("unchecked")
    public boolean apply(CommandContext ctx, AiCommand command) {
        CommandApplier applier = registry.get(command.kind());
        if (applier == null) return false;
        applier.apply(ctx, command);
        return true;
    }

    // ------------------------------------------------------------------
    // Individual appliers — pure game logic, no JSON
    // ------------------------------------------------------------------

    private void applyMoveTo(CommandContext ctx, AiCommand.MoveTo cmd) {
        ctx.mob().getNavigation().startMovingTo(cmd.x(), cmd.y(), cmd.z(), cmd.speed());
    }

    private void applyAttack(CommandContext ctx, AiCommand.Attack cmd) {
        Entity target = ctx.world().getEntityById(cmd.targetEntityId());
        if (target != null && target.isAlive()) {
            ctx.mob().tryAttack(ctx.world(), target);
            ctx.mob().lookAtEntity(target, 30.0f, 30.0f);
        }
    }

    private void applyIdle(CommandContext ctx, AiCommand.Idle cmd) {
        ctx.mob().getNavigation().stop();
    }

    private void applySpeak(CommandContext ctx, AiCommand.Speak cmd) {
        for (var player : ctx.world().getPlayers()) {
            if (ctx.mob().squaredDistanceTo(player) < 32 * 32) {
                player.sendMessage(Text.of("\u00A7c<AI> " + cmd.message()), false);
            }
        }
    }

    private void applyCallForHelp(CommandContext ctx, AiCommand.CallForHelp cmd) {
        ctx.creatureManager().spawnReinforcements(ctx.world(), ctx.mob().getId(), cmd.count());
    }

    private void applyPoopPoison(CommandContext ctx, AiCommand.PoopPoison cmd) {
        Entity target = ctx.world().getEntityById(cmd.targetEntityId());
        if (target instanceof LivingEntity living && living.isAlive()) {
            living.addStatusEffect(new net.minecraft.entity.effect.StatusEffectInstance(
                    net.minecraft.entity.effect.StatusEffects.POISON,
                    cmd.durationTicks(),
                    cmd.amplifier()
            ));
            ServerWorld world = ctx.world();
            world.spawnParticles(
                    net.minecraft.particle.ParticleTypes.ITEM_SLIME,
                    ctx.mob().getX(),
                    ctx.mob().getY() + ctx.mob().getStandingEyeHeight() * 0.5,
                    ctx.mob().getZ(),
                    8, 0.3, 0.2, 0.3, 0.02
            );
            world.playSound(null, ctx.mob().getBlockPos(),
                    SoundEvents.BLOCK_SLIME_BLOCK_BREAK, SoundCategory.NEUTRAL,
                    1.0f, 1.6f);
            ctx.mob().lookAtEntity(target, 30.0f, 30.0f);
        }
    }

    private void applyPlaceBlock(CommandContext ctx, AiCommand.PlaceBlock cmd) {
        BlockPos pos = new BlockPos(cmd.x(), cmd.y(), cmd.z());
        if (ctx.world().getBlockState(pos).isAir()) {
            if ("scaffolding".equals(cmd.blockType())) {
                ctx.world().setBlockState(pos, Blocks.SCAFFOLDING.getDefaultState());
            }
            if (cmd.cleanupTicks() > 0) {
                ctx.scaffoldTracker().track(pos, ctx.world().getTime(), cmd.cleanupTicks());
            }
        }
    }

    private void applyTeleport(CommandContext ctx, AiCommand.Teleport cmd) {
        ServerWorld world = ctx.world();
        var mob = ctx.mob();
        world.spawnParticles(ParticleTypes.PORTAL,
                mob.getX(), mob.getY() + 1.0, mob.getZ(),
                32, 0.5, 1.0, 0.5, 0.1);
        world.playSound(null, mob.getBlockPos(),
                SoundEvents.ENTITY_ENDERMAN_TELEPORT, SoundCategory.HOSTILE, 1.0f, 1.0f);

        mob.teleport(world, cmd.x(), cmd.y(), cmd.z(),
                java.util.Set.of(), mob.getYaw(), mob.getPitch(), false);

        world.spawnParticles(ParticleTypes.PORTAL,
                cmd.x(), cmd.y() + 1.0, cmd.z(),
                32, 0.5, 1.0, 0.5, 0.1);
    }

    private void applyShootArrow(CommandContext ctx, AiCommand.ShootArrow cmd) {
        Entity target = ctx.world().getEntityById(cmd.targetEntityId());
        if (target instanceof LivingEntity living && living.isAlive()) {
            var mob = ctx.mob();
            ArrowEntity arrow = new ArrowEntity(ctx.world(), mob, new ItemStack(Items.ARROW), null);
            Vec3d toTarget = new Vec3d(
                    living.getX() - mob.getX(),
                    living.getEyeY() - arrow.getY(),
                    living.getZ() - mob.getZ());
            double dist = toTarget.horizontalLength();
            arrow.setVelocity(toTarget.x, toTarget.y + dist * 0.2, toTarget.z,
                    cmd.power() * 3.0f, 1.0f);
            ctx.world().spawnEntity(arrow);
            ctx.world().playSound(null, mob.getBlockPos(),
                    SoundEvents.ENTITY_SKELETON_SHOOT, SoundCategory.HOSTILE,
                    1.0f, 1.0f / (ctx.world().getRandom().nextFloat() * 0.4f + 0.8f));
            mob.lookAtEntity(target, 30.0f, 30.0f);
        }
    }

    private void applySetGoal(CommandContext ctx, AiCommand.SetGoal cmd) {
        LOGGER.debug("[AI] SetGoal not yet implemented: {}", cmd.goal());
    }
}
