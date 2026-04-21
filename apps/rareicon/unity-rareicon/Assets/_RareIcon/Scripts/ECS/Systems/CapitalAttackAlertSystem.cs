using MessagePipe;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Publishes a debounced "Capital under attack" toast when Capital HP drops since last sample. Cooldown-gated so rapid hits don't spam.</summary>
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateBefore(typeof(BuildingDeathSystem))]
    public partial class CapitalAttackAlertSystem : SystemBase
    {
        const float AlertCooldown = 15f;

        int _lastSeenHp = -1;
        double _nextAlertTime;

        protected override void OnUpdate()
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital))
            {
                _lastSeenHp = -1;
                return;
            }
            if (!SystemAPI.HasComponent<BuildingHealth>(capital)) return;

            int hp = SystemAPI.GetComponent<BuildingHealth>(capital).Value;

            if (_lastSeenHp < 0)
            {
                _lastSeenHp = hp;
                return;
            }

            if (hp < _lastSeenHp)
            {
                double now = SystemAPI.Time.ElapsedTime;
                if (now >= _nextAlertTime)
                {
                    Publish("Capital under attack!");
                    _nextAlertTime = now + AlertCooldown;
                }
            }

            _lastSeenHp = hp;
        }

        static void Publish(string text)
        {
            try
            {
                var pub = GlobalMessagePipe.GetPublisher<ToastMessage>();
                pub?.Publish(new ToastMessage(text, ToastKind.Warning));
            }
            catch { }
        }
    }
}
