# combat

Deterministic combat resolution for real-time and turn-based games, with no engine attached.

## Why one crate for two kinds of combat

Real-time and turn-based combat look like different problems and are not. They disagree about _when_ a resolution happens and about how time advances; they agree completely about what a resolution _is_. Given an attacker, a defender, an ability and a source of randomness, the damage is the damage.

So the split is not "real-time module, turn-based module":

- **this crate** owns stats, abilities, effects, cooldowns and the resolution maths, and knows nothing about frames, turns or space
- **the caller** owns scheduling and the world — when to resolve, who is inside the cone, and what to do with the outcome

A turn-based lane advances the clock by a turn's worth and resolves on command. A real-time lane advances it by the frame delta and resolves when a swing connects. Both call the same `resolve` and get the same answer.

Every duration is a `Millis`, which is what makes that true: a turn is not a different unit of time, only a larger step of the same one.

## Determinism

A server re-simulating a client's attack has to reach the client's conclusion, and a replay has to replay. So:

- randomness is an explicit, seeded `Rng` passed in by the caller, never drawn from the environment
- chances are per-mille integers rather than floats
- damage is computed in integers throughout

## No world, no allocator

Nothing here stores a position, an entity id or a collection. Range arrives as a distance the caller measured; a cone's victims are found by the caller's spatial query. The crate builds `--no-default-features` as `no_std` and on `wasm32-unknown-unknown`.

## Example

```rust
use combat::{Ability, Health, Millis, Modifiers, Rng, Stats, Timer, resolve};

let sword = Ability::swing(20, 250, 90);
let attacker = Stats { power: 5, ..Stats::default() };
let defender = Stats { armor: 4, ..Stats::default() };

let mut rng = Rng::new(7, 0);
let outcome = resolve(&sword, &attacker, &defender, Modifiers::default(), &mut rng);

assert_eq!(outcome.damage(), 21);

let mut health = Health::new(100);
health.damage(outcome.damage());
assert_eq!(health.current(), 79);
```

## Design notes

A few decisions that are easy to undo by accident:

- **A connected hit always deals at least 1.** Enough armour should make a character tough, never unkillable.
- **Evasion is floored at a 5% chance to be hit.** A defender who cannot be hit cannot be fought.
- **Stacked multipliers are multiplicative and floored.** Integer per-mille arithmetic truncates, so without a floor four stacked reductions reach zero and grant immunity.
- **Crits multiply before armour is subtracted**, so armour scales sensibly instead of being trivialised.
- **Effects carry a sub-point remainder**, so a damage-over-time effect deals the same total whether it is ticked once a second or sixty times a second.
- **A cooldown restart keeps whichever duration is longer.** Otherwise a shared, shorter cooldown becomes a way to skip a longer one.
- **The dead are not healed.** Resurrection is `Health::revive`, a deliberate act; a stray area heal must not do it by accident.
- **Denial reasons are ordered**, so an ability bar can say the most useful true thing rather than the first one it noticed.

## Licence

See the workspace licence.
