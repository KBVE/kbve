using System;
using UnityEngine;

namespace KBVE.Events
{
    public static class SceneEvent
    {
        public static event Action<string> OnSceneLoadRequested;
        public static event Action<string> OnSingleSceneLoadRequested;


        public static void RequestSceneLoad(string sceneName)
        {
            Debug.Log($"Requesting load for scene: {sceneName}");
            OnSceneLoadRequested?.Invoke(sceneName);
        }

        public static void RequestSingleSceneLoad(string sceneName)
        {
           Debug.Log($"Requesting load via Single for scene: {sceneName}");
            OnSingleSceneLoadRequested?.Invoke(sceneName);
        }
    }
}
