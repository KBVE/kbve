package com.kbve.statetree.ship;

import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.projectile.ArrowEntity;
import net.minecraft.entity.projectile.FireballEntity;
import net.minecraft.entity.projectile.thrown.EggEntity;
import net.minecraft.entity.projectile.thrown.ExperienceBottleEntity;
import net.minecraft.entity.projectile.thrown.SnowballEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.Vec3d;

import java.util.HashMap;
import java.util.Map;

/**
 * Vanilla items that act as ship weapons. Each weapon spawns its
 * corresponding projectile from the firing mount when the pilot
 * triggers the fire command.
 */
public final class ShipWeapons {

    /** Cooldown ticks between shots from the same mount. */
    public static final int FIRE_COOLDOWN = 8;

    public interface Weapon {
        /** Spawn the projectile from {@code origin} with normalized {@code direction}. */
        void fire(ServerWorld world, ShipEntity ship, LivingEntity pilot,
                  Vec3d origin, Vec3d direction);
    }

    private static final Map<Item, Weapon> WEAPONS = new HashMap<>();

    static {
        WEAPONS.put(Items.SNOWBALL, (world, ship, pilot, origin, dir) -> {
            SnowballEntity p = new SnowballEntity(world, pilot, ItemStack.EMPTY);
            spawnProjectile(world, ship, p, origin, dir, 1.6f);
        });
        WEAPONS.put(Items.EGG, (world, ship, pilot, origin, dir) -> {
            EggEntity p = new EggEntity(world, pilot, ItemStack.EMPTY);
            spawnProjectile(world, ship, p, origin, dir, 1.6f);
        });
        WEAPONS.put(Items.EXPERIENCE_BOTTLE, (world, ship, pilot, origin, dir) -> {
            ExperienceBottleEntity p = new ExperienceBottleEntity(world, pilot, ItemStack.EMPTY);
            spawnProjectile(world, ship, p, origin, dir, 1.4f);
        });
        WEAPONS.put(Items.ARROW, (world, ship, pilot, origin, dir) -> {
            ArrowEntity p = new ArrowEntity(world, pilot, new ItemStack(Items.ARROW), null);
            spawnProjectile(world, ship, p, origin, dir, 2.5f);
            p.setDamage(3.0);
        });
        WEAPONS.put(Items.SPECTRAL_ARROW, (world, ship, pilot, origin, dir) -> {
            ArrowEntity p = new ArrowEntity(world, pilot, new ItemStack(Items.ARROW), null);
            spawnProjectile(world, ship, p, origin, dir, 2.5f);
            p.setDamage(4.0);
        });
        WEAPONS.put(Items.FIRE_CHARGE, (world, ship, pilot, origin, dir) -> {
            FireballEntity p = new FireballEntity(world, pilot,
                    new Vec3d(dir.x, dir.y, dir.z).multiply(0.1), 1);
            p.setPosition(origin.x, origin.y, origin.z);
            world.spawnEntity(p);
        });
    }

    private static void spawnProjectile(ServerWorld world, ShipEntity ship,
                                        Entity projectile, Vec3d origin, Vec3d dir,
                                        float speed) {
        projectile.setPosition(origin.x, origin.y, origin.z);
        Vec3d shipVel = ship.getVelocity();
        projectile.setVelocity(dir.x * speed + shipVel.x,
                dir.y * speed + shipVel.y,
                dir.z * speed + shipVel.z);
        world.spawnEntity(projectile);
    }

    private ShipWeapons() {}

    public static boolean isWeapon(Item item) {
        return WEAPONS.containsKey(item);
    }

    public static Weapon weaponFor(Item item) {
        return WEAPONS.get(item);
    }
}
