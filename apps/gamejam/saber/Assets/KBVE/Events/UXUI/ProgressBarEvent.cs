using System;

namespace KBVE.Events
{
    public static class ProgressBarEvent
    {
        public static event Action<float> OnProgressUpdate;
        public static event Action OnShow;
        public static event Action OnHide;

        public static void UpdateProgress(float progress)
        {
            OnProgressUpdate?.Invoke(progress);
        }

        public static void Show()
        {
            OnShow?.Invoke();
        }

        public static void Hide()
        {
            OnHide?.Invoke();
        }
    }
}
