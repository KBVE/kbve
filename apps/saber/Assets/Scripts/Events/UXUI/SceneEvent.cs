using System;

namespace KBVE.Events
{
    public static class SceneEvent
    {
        public static event Action<string> OnSceneLoadRequested;

        public static void RequestSceneLoad(string sceneName)
        {
            OnSceneLoadRequested?.Invoke(sceneName);
        }
    }
}
