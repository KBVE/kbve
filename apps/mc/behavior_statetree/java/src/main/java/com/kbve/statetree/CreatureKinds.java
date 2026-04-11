package com.kbve.statetree;

/**
 * Registry of built-in {@link CreatureKind} instances.
 *
 * <p>Adding a new AI archetype means: (1) write a new {@code CreatureKind}
 * implementation, (2) add a constant here, (3) wire it into the world
 * command dispatch in {@link NpcTickHandler}. No new manager class, no
 * new tracking map, no new observation loop.
 */
public final class CreatureKinds {

    public static final CreatureKind SKELETON = new SkeletonCreatureKind();
    public static final CreatureKind PET_DOG = new PetDogCreatureKind();

    private CreatureKinds() {}
}
