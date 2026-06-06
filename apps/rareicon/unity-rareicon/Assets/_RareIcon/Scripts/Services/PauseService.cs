using System.Collections.Generic;
using R3;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Reason-stack pause service. Any reason on the stack = paused; empty stack resumes. Drives <c>Time.timeScale</c> today; multiplayer builds replace <see cref="ApplyTimeScale"/> with a no-op and treat <see cref="IsPausedRx"/> as a personal input gate.</summary>
    public class PauseService
    {
        readonly HashSet<PauseReason> _reasons = new();
        readonly ReactiveProperty<bool> _isPaused = new(false);
        PauseReason _topReason = PauseReason.None;

        public ReadOnlyReactiveProperty<bool> IsPausedRx => _isPaused;
        public bool IsPaused => _reasons.Count > 0;
        public PauseReason TopReason => _topReason;

        public void Pause(PauseReason reason)
        {
            if (reason == PauseReason.None) return;
            if (!_reasons.Add(reason)) return;
            _topReason = reason;
            ApplyTimeScale();
            _isPaused.Value = true;
        }

        public void Resume(PauseReason reason)
        {
            if (!_reasons.Remove(reason)) return;
            _topReason = PickTopReason();
            ApplyTimeScale();
            _isPaused.Value = _reasons.Count > 0;
        }

        /// <summary>Explicitly clear every active pause. Intended for scene teardown — gameplay code should pair Pause/Resume, not call this.</summary>
        public void ClearAll()
        {
            if (_reasons.Count == 0) return;
            _reasons.Clear();
            _topReason = PauseReason.None;
            ApplyTimeScale();
            _isPaused.Value = false;
        }

        PauseReason PickTopReason()
        {
            foreach (var r in _reasons) return r;
            return PauseReason.None;
        }

        void ApplyTimeScale()
        {
            Time.timeScale = _reasons.Count > 0 ? 0f : 1f;
        }
    }
}
