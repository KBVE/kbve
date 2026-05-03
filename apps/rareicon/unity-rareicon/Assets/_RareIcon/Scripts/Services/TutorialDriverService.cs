using MessagePipe;
using Unity.Entities;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Watches game state on a coarse cadence and emits the next onboarding hint to the bottom-right panel. Hints advance through OpenBuildPalette → PlaceCapital → PlaceFarm → Complete; each step's completion is detected by polling the gameplay world (capital tag, farm building type) plus the palette's open state. Designed to be the single coaching surface so future management hints (recruit, repair, raid warnings) reuse the same bus.</summary>
    public sealed class TutorialDriverService : ITickable
    {
        const float PollInterval = 0.5f;
        const float CompleteHoldSeconds = 6f;

        readonly UIBuildingPalette _palette;
        readonly AppStateController _appState;
        readonly IPublisher<TutorialHintMessage> _pub;

        TutorialStepId _current = TutorialStepId.None;
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
            if (_current == TutorialStepId.None && _appState.Current.CurrentValue == AppInterfaceState.World)
                Advance(TutorialStepId.OpenBuildPalette);

            if (_palette.IsOpen.CurrentValue) _paletteOpenedOnce = true;

            _accum += UnityEngine.Time.unscaledDeltaTime;
            if (_accum < PollInterval) return;
            _accum = 0f;

            if (_completeHoldRemaining > 0f)
            {
                _completeHoldRemaining -= PollInterval;
                if (_completeHoldRemaining <= 0f) Advance(TutorialStepId.None);
                return;
            }

            switch (_current)
            {
                case TutorialStepId.OpenBuildPalette:
                    if (_paletteOpenedOnce) Advance(TutorialStepId.PlaceCapital);
                    break;
                case TutorialStepId.PlaceCapital:
                    if (HasCapital()) Advance(TutorialStepId.PlaceFarm);
                    break;
                case TutorialStepId.PlaceFarm:
                    if (HasFarm()) Advance(TutorialStepId.Complete);
                    break;
                case TutorialStepId.Complete:
                    _completeHoldRemaining = CompleteHoldSeconds;
                    break;
            }
        }

        void Advance(TutorialStepId next)
        {
            if (_current == next) return;
            _current = next;
            _pub?.Publish(BuildMessage(next));
        }

        static TutorialHintMessage BuildMessage(TutorialStepId step) => step switch
        {
            TutorialStepId.OpenBuildPalette => new TutorialHintMessage(step, "Open the build palette", "B"),
            TutorialStepId.PlaceCapital     => new TutorialHintMessage(step, "Place your Capital on a land hex", string.Empty),
            TutorialStepId.PlaceFarm        => new TutorialHintMessage(step, "Build a Farm to feed your goblins", string.Empty),
            TutorialStepId.Complete         => new TutorialHintMessage(step, "Nice. Hint panel will hide shortly.", string.Empty),
            _                               => new TutorialHintMessage(TutorialStepId.None, string.Empty, string.Empty),
        };

        static bool HasCapital()
        {
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return false;
            using var q = world.EntityManager.CreateEntityQuery(ComponentType.ReadOnly<CapitalTag>());
            return !q.IsEmpty;
        }

        static bool HasFarm()
        {
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return false;
            var em = world.EntityManager;
            using var q = em.CreateEntityQuery(ComponentType.ReadOnly<Building>());
            if (q.IsEmpty) return false;
            using var arr = q.ToComponentDataArray<Building>(Unity.Collections.Allocator.Temp);
            for (int i = 0; i < arr.Length; i++)
                if (arr[i].Type == BuildingType.Farm) return true;
            return false;
        }
    }
}
