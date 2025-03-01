using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
using VContainer;
using VContainer.Unity;
using MoreMountains.Tools;

namespace KBVE.MMExtensions.Shaco
{
    public class SoundManagerEntryPoint : IStartable
    {
        private readonly MMSoundManager _soundManager;

        public SoundManagerEntryPoint(MMSoundManager soundManager)
        {
            _soundManager = soundManager;
        }

        public void Start()
        {
            // Example Initialization Logic
            // _soundManager.NormalTimeScale = 1f;
            // _soundManager.UpdateTimescale = true;
            // _soundManager.UpdateFixedDeltaTime = true;
            // _soundManager.UpdateMaximumDeltaTime = true;
            Debug.Log("MMSoundManager initialized in SoundManagerEntryPoint");
        }
    }
}
