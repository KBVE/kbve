namespace KBVE.MMExtensions.Orchestrator.Core
{
    public interface IToastService
    {
        /// <summary>
        /// Show a toast message with the specified type and duration.
        /// May interrupt or replace currently visible toast.
        /// </summary>
        void ShowToast(string message, ToastType type = ToastType.Info, float duration = 2.5f);

        /// <summary>
        /// Immediately display a toast, replacing any active one.
        /// </summary>
        void ShowImmediateToast(string message, ToastType type = ToastType.Info, float duration = 2.5f);

        /// <summary>
        /// Queue a toast to be shown after current one finishes.
        /// </summary>
        void EnqueueToast(string message, ToastType type = ToastType.Info, float duration = 2.5f);

        /// <summary>
        /// Clears all visible and queued toasts.
        /// </summary>
        void ClearAllToasts();
    }
}
