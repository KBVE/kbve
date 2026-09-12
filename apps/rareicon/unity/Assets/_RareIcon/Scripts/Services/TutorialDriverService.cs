using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Single coaching surface for the bottom-right hint panel. Three layers: an onboarding chain (1–9, sequential, only advances forward), ambient management hints (10–49, evaluated after the chain finishes), and crisis hints (50+, override anything else when active). Adds new hints by extending <see cref="TutorialStepId"/>, dropping a check into <see cref="EvaluateAmbient"/> or <see cref="EvaluateCrisis"/>, and wiring its prompt in <see cref="BuildMessage"/>.</summary>
    public sealed class TutorialDriverService : ITickable
    {
        const float PollInterval = 0.5f;
        const float CompleteHoldSeconds = 6f;
        const float CapitalLowHPRatio = 0.5f;
        const uint  RaidWarningWindowMs = 30_000;

        readonly UIBuildingPalette _palette;
        readonly AppStateController _appState;
        readonly IPublisher<TutorialHintMessage> _pub;

        TutorialStepId _current = TutorialStepId.None;
        byte _chainStep;
        bool _chainDone;
        bool _paletteOpenedOnce;
        float _accum;
        float _completeHoldRemaining;

        [Inject]
        public TutorialDriverService(
            UIBuildingPalette palette,
            AppStateController appState,
            IPublisher<TutorialHintMessage> pub)
        {
            _palette = palette;
            _appState = appState;
            _pub = pub;
        }

        public void Tick()
        {
            if (_palette.IsOpen.CurrentValue) _paletteOpenedOnce = true;

            _accum += UnityEngine.Time.unscaledDeltaTime;
            if (_accum < PollInterval) return;
            _accum = 0f;

            if (_appState.Current.CurrentValue != AppInterfaceState.World)
            {
                Advance(TutorialStepId.None);
                return;
            }

            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;

            var crisis = EvaluateCrisis(world);
            if (crisis != TutorialStepId.None)
            {
                Advance(crisis);
                return;
            }

            if (!_chainDone)
            {
                AdvanceChain(world);
                return;
            }

            if (_completeHoldRemaining > 0f)
            {
                _completeHoldRemaining -= PollInterval;
                if (_completeHoldRemaining > 0f) return;
            }

            var ambient = EvaluateAmbient(world);
            Advance(ambient);
        }

        void AdvanceChain(World world)
        {
            switch (_chainStep)
            {
                case 0:
                    _chainStep = 1;
                    Advance(TutorialStepId.OpenBuildPalette);
                    return;
                case 1:
                    if (_paletteOpenedOnce) { _chainStep = 2; Advance(TutorialStepId.PlaceCapital); }
                    return;
                case 2:
                    if (HasCapital(world)) { _chainStep = 3; Advance(TutorialStepId.PlaceFarm); }
                    return;
                case 3:
                    if (HasBuilding(world, BuildingType.Farm))
                    {
                        _chainStep = 4;
                        _completeHoldRemaining = CompleteHoldSeconds;
                        Advance(TutorialStepId.Complete);
                    }
                    return;
                case 4:
                    _chainDone = true;
                    return;
            }
        }

        TutorialStepId EvaluateCrisis(World world)
        {
            if (CapitalIsLow(world)) return TutorialStepId.CapitalLowHP;
            if (RaidIsImminent(world)) return TutorialStepId.RaidIncoming;
            return TutorialStepId.None;
        }

        TutorialStepId EvaluateAmbient(World world)
        {
            if (HasCapital(world) && !HasBuilding(world, BuildingType.Barracks))
                return TutorialStepId.BuildBarracks;
            if (HasBuilding(world, BuildingType.Barracks) && !HasPlayerSoldier(world))
                return TutorialStepId.RecruitSoldier;
            return TutorialStepId.None;
        }

        void Advance(TutorialStepId next)
        {
            if (_current == next) return;
            _current = next;
            _pub?.Publish(BuildMessage(next));
        }

        static TutorialHintMessage BuildMessage(TutorialStepId step) => step switch
        {
            TutorialStepId.OpenBuildPalette => new TutorialHintMessage(step, "Open the build palette",                  "B"),
            TutorialStepId.PlaceCapital     => new TutorialHintMessage(step, "Place your Capital on a land hex",        ""),
            TutorialStepId.PlaceFarm        => new TutorialHintMessage(step, "Build a Farm to feed your goblins",       ""),
            TutorialStepId.Complete         => new TutorialHintMessage(step, "Settlement bootstrapped. Watching for next steps.", ""),

            TutorialStepId.BuildBarracks    => new TutorialHintMessage(step, "Build a Barracks to recruit soldiers",    ""),
            TutorialStepId.RecruitSoldier   => new TutorialHintMessage(step, "Open the Barracks to recruit a Soldier",  ""),

            TutorialStepId.CapitalLowHP     => new TutorialHintMessage(step, "Capital under attack — defend it!",        "", TutorialHintTone.Crisis),
            TutorialStepId.RaidIncoming     => new TutorialHintMessage(step, "Bandit raid incoming — garrison your walls", "", TutorialHintTone.Crisis),

            _ => new TutorialHintMessage(TutorialStepId.None, "", ""),
        };

        static bool HasCapital(World world)
        {
            using var q = world.EntityManager.CreateEntityQuery(ComponentType.ReadOnly<CapitalTag>());
            return !q.IsEmpty;
        }

        static bool HasBuilding(World world, byte buildingType)
        {
            var em = world.EntityManager;
            using var q = em.CreateEntityQuery(ComponentType.ReadOnly<Building>());
            if (q.IsEmpty) return false;
            using var arr = q.ToComponentDataArray<Building>(Allocator.Temp);
            for (int i = 0; i < arr.Length; i++)
                if (arr[i].Type == buildingType) return true;
            return false;
        }

        static bool HasPlayerSoldier(World world)
        {
            var em = world.EntityManager;
            using var q = em.CreateEntityQuery(
                ComponentType.ReadOnly<Unit>(),
                ComponentType.ReadOnly<Faction>());
            if (q.IsEmpty) return false;
            using var units    = q.ToComponentDataArray<Unit>(Allocator.Temp);
            using var factions = q.ToComponentDataArray<Faction>(Allocator.Temp);
            for (int i = 0; i < units.Length; i++)
                if (factions[i].Value == FactionType.Player && units[i].Type == UnitType.Soldier)
                    return true;
            return false;
        }

        static bool CapitalIsLow(World world)
        {
            var em = world.EntityManager;
            using var q = em.CreateEntityQuery(
                ComponentType.ReadOnly<CapitalTag>(),
                ComponentType.ReadOnly<BuildingHealth>());
            if (q.IsEmpty) return false;
            using var arr = q.ToComponentDataArray<BuildingHealth>(Allocator.Temp);
            for (int i = 0; i < arr.Length; i++)
            {
                var hp = arr[i];
                if (hp.Max <= 0) continue;
                if ((float)hp.Value / hp.Max < CapitalLowHPRatio) return true;
            }
            return false;
        }

        static bool RaidIsImminent(World world)
        {
            var em = world.EntityManager;
            using var q = em.CreateEntityQuery(ComponentType.ReadOnly<BanditCampState>());
            if (q.IsEmpty) return false;
            uint nowMs = (uint)(world.Time.ElapsedTime * 1000d);
            using var arr = q.ToComponentDataArray<BanditCampState>(Allocator.Temp);
            for (int i = 0; i < arr.Length; i++)
            {
                uint next = arr[i].NextRaidTick;
                if (next <= nowMs) continue;
                if (next - nowMs <= RaidWarningWindowMs) return true;
            }
            return false;
        }
    }
}
