using UnityEngine;

namespace RareIcon
{
    /// <summary>Helpers for grabbing a small PNG of the current screen — used by the save flow to stamp a 256×144 preview into the slot bundle. Synchronous (the <see cref="ScreenCapture.CaptureScreenshotAsTexture"/> read-back blocks on the GPU). Call from the save button handler, not from a per-frame path.</summary>
    public static class ScreenshotService
    {
        public const int DefaultThumbWidth  = 256;
        public const int DefaultThumbHeight = 144;

        /// <summary>Capture the back-buffer + downscale to <paramref name="width"/>×<paramref name="height"/> + encode as PNG. Returns null on failure (no main camera, GPU read-back blocked, etc.).</summary>
        public static byte[] CaptureThumbnailPng(int width = DefaultThumbWidth, int height = DefaultThumbHeight)
        {
            Texture2D src = null;
            RenderTexture rt = null;
            Texture2D thumb = null;
            try
            {
                src = ScreenCapture.CaptureScreenshotAsTexture();
                if (src == null || src.width == 0 || src.height == 0) return null;

                rt = RenderTexture.GetTemporary(width, height, 0, RenderTextureFormat.ARGB32);
                Graphics.Blit(src, rt);

                var prev = RenderTexture.active;
                RenderTexture.active = rt;
                thumb = new Texture2D(width, height, TextureFormat.RGB24, false);
                thumb.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                thumb.Apply();
                RenderTexture.active = prev;

                return thumb.EncodeToPNG();
            }
            catch (System.Exception e)
            {
                Debug.LogWarning($"[ScreenshotService] capture failed: {e.Message}");
                return null;
            }
            finally
            {
                if (rt != null)    RenderTexture.ReleaseTemporary(rt);
                if (src != null)   Object.Destroy(src);
                if (thumb != null) Object.Destroy(thumb);
            }
        }
    }
}
