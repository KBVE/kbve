using Unity.Mathematics;

namespace RareIcon
{
    public readonly struct SceneLoadRequestMessage
    {
        public readonly string SceneName;
        public SceneLoadRequestMessage(string sceneName) => SceneName = sceneName;
    }

    public readonly struct SceneLoadedMessage
    {
        public readonly string SceneName;
        public SceneLoadedMessage(string sceneName) => SceneName = sceneName;
    }

    public readonly struct PlayerDamagedMessage
    {
        public readonly int Damage;
        public readonly float3 Position;
        public PlayerDamagedMessage(int damage, float3 position)
        {
            Damage = damage;
            Position = position;
        }
    }

    public readonly struct PlayerDeathMessage { }
}
