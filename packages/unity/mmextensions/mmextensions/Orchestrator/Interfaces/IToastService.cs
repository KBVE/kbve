namespace KBVE.MMExtensions.Orchestrator.Core
{
    public interface IToastService
    {
        /// <summary>
        /// Queue a toast with message, type, duration, and optional background.
        /// Replaces current toast if no other is showing.
        /// </summary>
        void Show(string message, ToastType type = ToastType.Info, float duration = 2.5f, string backgroundKey = null);

        /// <summary>
        /// Clear current and all pending toasts.
        /// </summary>
        void ClearAllToasts();
    }
}