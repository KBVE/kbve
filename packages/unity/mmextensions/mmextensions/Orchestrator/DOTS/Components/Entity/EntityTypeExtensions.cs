using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public static class EntityTypeExtensions
    {
        // ===== CORE TYPE CHECKING =====
        public static bool IsResource(this EntityType type) => (type & EntityType.Resource) != 0;
        public static bool IsStructure(this EntityType type) => (type & EntityType.Structure) != 0;
        public static bool IsMonster(this EntityType type) => (type & EntityType.Monster) != 0;
        public static bool IsUnit(this EntityType type) => (type & EntityType.Unit) != 0;
        public static bool IsPlayer(this EntityType type) => (type & EntityType.Player) != 0;
        public static bool IsNPC(this EntityType type) => (type & EntityType.NPC) != 0;
        public static bool IsProjectile(this EntityType type) => (type & EntityType.Projectile) != 0;
        public static bool IsItem(this EntityType type) => (type & EntityType.Item) != 0;

        // ===== ALLEGIANCE =====
        public static bool IsNeutral(this EntityType type) => (type & EntityType.Neutral) != 0;
        public static bool IsEnemy(this EntityType type) => (type & EntityType.Enemy) != 0;
        public static bool IsAlly(this EntityType type) => (type & EntityType.Ally) != 0;
        public static bool IsBoss(this EntityType type) => (type & EntityType.Boss) != 0;

        // ===== PROPERTIES =====
        public static bool IsInteractable(this EntityType type) => (type & EntityType.Interactable) != 0;
        public static bool IsDestructible(this EntityType type) => (type & EntityType.Destructible) != 0;
        public static bool IsCollectible(this EntityType type) => (type & EntityType.Collectible) != 0;
        public static bool IsTradeable(this EntityType type) => (type & EntityType.Tradeable) != 0;
        public static bool IsUpgradeable(this EntityType type) => (type & EntityType.Upgradeable) != 0;
        public static bool IsStackable(this EntityType type) => (type & EntityType.Stackable) != 0;
        public static bool IsConsumable(this EntityType type) => (type & EntityType.Consumable) != 0;
        public static bool IsEquippable(this EntityType type) => (type & EntityType.Equippable) != 0;

        // ===== SPECIAL STATES =====
        public static bool IsElite(this EntityType type) => (type & EntityType.Elite) != 0;
        public static bool IsRare(this EntityType type) => (type & EntityType.Rare) != 0;
        public static bool IsEpic(this EntityType type) => (type & EntityType.Epic) != 0;
        public static bool IsLegendary(this EntityType type) => (type & EntityType.Legendary) != 0;
        public static bool IsQuest(this EntityType type) => (type & EntityType.Quest) != 0;
        public static bool IsTemporary(this EntityType type) => (type & EntityType.Temporary) != 0;
        public static bool IsPersistent(this EntityType type) => (type & EntityType.Persistent) != 0;
        public static bool IsSpawner(this EntityType type) => (type & EntityType.Spawner) != 0;

        // ===== ACTION STATE CHECKING =====
        public static bool IsIdle(this EntityActionFlags flags) => (flags & EntityActionFlags.Idle) != 0;
        public static bool IsMoving(this EntityActionFlags flags) => (flags & EntityActionFlags.Moving) != 0;
        public static bool IsAttacking(this EntityActionFlags flags) => (flags & EntityActionFlags.Attacking) != 0;
        public static bool IsHarvesting(this EntityActionFlags flags) => (flags & EntityActionFlags.Harvesting) != 0;
        public static bool IsBuilding(this EntityActionFlags flags) => (flags & EntityActionFlags.Building) != 0;
        public static bool IsProducing(this EntityActionFlags flags) => (flags & EntityActionFlags.Producing) != 0;
        public static bool IsDead(this EntityActionFlags flags) => (flags & EntityActionFlags.Dead) != 0;
        public static bool IsDamaged(this EntityActionFlags flags) => (flags & EntityActionFlags.Damaged) != 0;
        public static bool IsHealing(this EntityActionFlags flags) => (flags & EntityActionFlags.Healing) != 0;
        public static bool IsStunned(this EntityActionFlags flags) => (flags & EntityActionFlags.Stunned) != 0;

        // ===== STATUS EFFECTS =====
        public static bool IsInvulnerable(this EntityActionFlags flags) => (flags & EntityActionFlags.Invulnerable) != 0;
        public static bool IsInvisible(this EntityActionFlags flags) => (flags & EntityActionFlags.Invisible) != 0;
        public static bool IsBurning(this EntityActionFlags flags) => (flags & EntityActionFlags.Burning) != 0;
        public static bool IsFrozen(this EntityActionFlags flags) => (flags & EntityActionFlags.Frozen) != 0;
        public static bool IsPoisoned(this EntityActionFlags flags) => (flags & EntityActionFlags.Poisoned) != 0;
        public static bool IsBuffed(this EntityActionFlags flags) => (flags & EntityActionFlags.Buffed) != 0;

        // ===== CAPABILITIES =====
        public static bool CanAttack(this EntityActionFlags flags) => (flags & EntityActionFlags.CanAttack) != 0;
        public static bool CanMove(this EntityActionFlags flags) => (flags & EntityActionFlags.CanMove) != 0;
        public static bool CanInteract(this EntityActionFlags flags) => (flags & EntityActionFlags.CanInteract) != 0;
        public static bool CanHarvest(this EntityActionFlags flags) => (flags & EntityActionFlags.CanHarvest) != 0;
        public static bool CanBuild(this EntityActionFlags flags) => (flags & EntityActionFlags.CanBuild) != 0;
        public static bool CanTrade(this EntityActionFlags flags) => (flags & EntityActionFlags.CanTrade) != 0;
        public static bool CanCraft(this EntityActionFlags flags) => (flags & EntityActionFlags.CanCraft) != 0;
        public static bool CanCast(this EntityActionFlags flags) => (flags & EntityActionFlags.CanCast) != 0;

        // ===== AI/BEHAVIOR =====
        public static bool IsAggressive(this EntityActionFlags flags) => (flags & EntityActionFlags.Aggressive) != 0;
        public static bool IsDefensive(this EntityActionFlags flags) => (flags & EntityActionFlags.Defensive) != 0;
        public static bool IsFleeing(this EntityActionFlags flags) => (flags & EntityActionFlags.Fleeing) != 0;
        public static bool IsPatrolling(this EntityActionFlags flags) => (flags & EntityActionFlags.Patrolling) != 0;

        // ===== MODIFIER METHODS =====
        public static void AddType(ref this EntityTypeComponent comp, EntityType type)
        {
            comp.Type |= type;
        }

        public static void RemoveType(ref this EntityTypeComponent comp, EntityType type)
        {
            comp.Type &= ~type;
        }

        public static void AddActionFlag(ref this EntityTypeComponent comp, EntityActionFlags flag)
        {
            comp.ActionFlags |= flag;
        }

        public static void RemoveActionFlag(ref this EntityTypeComponent comp, EntityActionFlags flag)
        {
            comp.ActionFlags &= ~flag;
        }

        public static void SetActionFlag(ref this EntityTypeComponent comp, EntityActionFlags flag, bool value)
        {
            if (value)
                comp.ActionFlags |= flag;
            else
                comp.ActionFlags &= ~flag;
        }

        public static bool HasType(this EntityTypeComponent comp, EntityType type)
        {
            return (comp.Type & type) == type;
        }

        public static bool HasAnyType(this EntityTypeComponent comp, EntityType types)
        {
            return (comp.Type & types) != 0;
        }

        public static bool HasActionFlag(this EntityTypeComponent comp, EntityActionFlags flag)
        {
            return (comp.ActionFlags & flag) == flag;
        }

        public static bool HasAnyActionFlag(this EntityTypeComponent comp, EntityActionFlags flags)
        {
            return (comp.ActionFlags & flags) != 0;
        }
    }
}