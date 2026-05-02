using UnityEngine;

namespace RareIcon
{
    /// <summary>Runtime safety net for the player-settings defaults — guarantees the build runs in a 1280×720 windowed mode and keeps simulating while the window is in the background. Belt-and-braces: ProjectSettings.asset already declares these (fullscreenMode=3, runInBackground=1, resizableWindow=1, defaultIsNativeResolution=0) but Unity occasionally honours stale launcher state across editor / build target swaps. Forcing it here guarantees the idle-empire loop keeps ticking when the player alt-tabs.</summary>
    public static class AppRuntimeBoot
    {
        const int DefaultWindowWidth  = 1280;
        const int DefaultWindowHeight = 720;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void Boot()
        {
            Application.runInBackground = true;

#if !UNITY_EDITOR
            // Editor's Play-mode resolution is driven by the Game view; only
            // override at build runtime so we don't fight the inspector.
            if (Screen.fullScreenMode != FullScreenMode.Windowed)
            {
                int w = Screen.currentResolution.width  > 0 ? Mathf.Min(DefaultWindowWidth,  Screen.currentResolution.width)  : DefaultWindowWidth;
                int h = Screen.currentResolution.height > 0 ? Mathf.Min(DefaultWindowHeight, Screen.currentResolution.height) : DefaultWindowHeight;
                Screen.SetResolution(w, h, FullScreenMode.Windowed);
            }
#endif
        }
    }
}
