using UnityEngine;

namespace RareIcon
{
    /// <summary>Runtime safety net for the player-settings defaults. Desktop standalone builds force 1280×720 windowed mode so the launcher state can't strand the player at fullscreen-locked exclusive resolution. Mobile builds (Android / iOS) skip the resize and instead re-arm <c>Screen.autorotateTo*</c> + <c>ScreenOrientation.AutoRotation</c> so the device freely rotates between portrait + landscape; the PanelSettings ScreenMatchMode = Shrink keeps the UI fitted to whichever dimension the player picks. Run-in-background flag stays on across all platforms so the idle-empire loop keeps ticking when the window is suspended / alt-tabbed.</summary>
    public static class AppRuntimeBoot
    {
        const int DefaultWindowWidth  = 1280;
        const int DefaultWindowHeight = 720;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void Boot()
        {
            Application.runInBackground = true;

#if !UNITY_EDITOR && !UNITY_ANDROID && !UNITY_IOS && !UNITY_WEBGL
            if (Screen.fullScreenMode != FullScreenMode.Windowed)
            {
                int w = Screen.currentResolution.width  > 0 ? Mathf.Min(DefaultWindowWidth,  Screen.currentResolution.width)  : DefaultWindowWidth;
                int h = Screen.currentResolution.height > 0 ? Mathf.Min(DefaultWindowHeight, Screen.currentResolution.height) : DefaultWindowHeight;
                Screen.SetResolution(w, h, FullScreenMode.Windowed);
            }
#endif

#if UNITY_ANDROID || UNITY_IOS
            Screen.autorotateToPortrait           = true;
            Screen.autorotateToPortraitUpsideDown = true;
            Screen.autorotateToLandscapeLeft      = true;
            Screen.autorotateToLandscapeRight     = true;
            Screen.orientation                    = ScreenOrientation.AutoRotation;
#endif
        }
    }
}
