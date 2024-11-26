using VContainer;
using VContainer.Unity;
using MoreMountains.Feedbacks;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;

namespace KBVE.MMExtensions.Shaco
{
    public class TimeManagerEntryPoint : IStartable
    {
        private readonly MMTimeManager _timeManager;

        public TimeManagerEntryPoint(MMTimeManager timeManager)
        {
            _timeManager = timeManager;
        }

        public void Start()
        {
            // Example Initialization Logic
            _timeManager.NormalTimeScale = 1f;
            _timeManager.UpdateTimescale = true;
            _timeManager.UpdateFixedDeltaTime = true;
            _timeManager.UpdateMaximumDeltaTime = true;
            Debug.Log("MMTimeManager initialized in TimeManagerEntryPoint");
        }
    }
}
