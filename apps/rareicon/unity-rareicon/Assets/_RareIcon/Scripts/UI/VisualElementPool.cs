using System;
using System.Collections.Generic;
using R3;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Reusable pool of <typeparamref name="T"/> visual elements. Repeating UI fragments (toast cards, lobby member rows, inspector list rows) acquire from the free stack and release back when hidden, eliminating per-frame allocations on heavy churn paths. Optional <c>onAcquire</c> / <c>onRelease</c> hooks let callers reset values + remove from a parent without leaking listeners. R3 <see cref="Subject{T}"/> hooks expose Acquire / Release events so dev tooling (panel debugger, perf overlay) can subscribe without coupling to specific consumers; the <see cref="Live"/> snapshot offers a polling-friendly count when subjects aren't needed.</summary>
    public sealed class VisualElementPool<T> : IDisposable where T : VisualElement
    {
        readonly Func<T> _factory;
        readonly Action<T> _onAcquire;
        readonly Action<T> _onRelease;
        readonly Stack<T> _free = new();
        readonly List<T>  _live = new();

        readonly Subject<T> _acquired = new();
        readonly Subject<T> _released = new();
        readonly ReactiveProperty<int> _liveCount = new(0);

        /// <summary>Fires when an element is checked out of the pool. Subscribe for hooks like analytics or debug overlays.</summary>
        public Observable<T> Acquired => _acquired;

        /// <summary>Fires when an element is returned to the pool.</summary>
        public Observable<T> Released => _released;

        /// <summary>Reactive count of currently-rented elements; cheap to bind from UI labels via R3.</summary>
        public ReadOnlyReactiveProperty<int> LiveCount => _liveCount;

        /// <summary>Read-only snapshot of currently-rented elements. Mutating the pool invalidates iterator order — copy before lengthy walks.</summary>
        public IReadOnlyList<T> Live => _live;

        /// <summary>Stack depth; how many elements are sitting idle ready to be reused.</summary>
        public int FreeCount => _free.Count;

        public VisualElementPool(Func<T> factory, Action<T> onAcquire = null, Action<T> onRelease = null, int prewarm = 0)
        {
            _factory   = factory ?? throw new ArgumentNullException(nameof(factory));
            _onAcquire = onAcquire;
            _onRelease = onRelease;
            for (int i = 0; i < prewarm; i++) _free.Push(_factory());
        }

        public T Acquire()
        {
            T el = _free.Count > 0 ? _free.Pop() : _factory();
            _live.Add(el);
            _liveCount.Value = _live.Count;
            _onAcquire?.Invoke(el);
            _acquired.OnNext(el);
            return el;
        }

        public void Release(T el)
        {
            if (el == null) return;
            int idx = _live.IndexOf(el);
            if (idx < 0) return;
            _live.RemoveAt(idx);
            _liveCount.Value = _live.Count;
            _onRelease?.Invoke(el);
            // Detach from any parent so the element doesn't leak into a
            // hierarchy after it's logically released. Caller owns the
            // value reset in onRelease (e.g. label.text = "").
            el.RemoveFromHierarchy();
            _free.Push(el);
            _released.OnNext(el);
        }

        /// <summary>Releases every rented element back into the pool. Cheap reset for panel re-open / world-reset flows.</summary>
        public void ReleaseAll()
        {
            for (int i = _live.Count - 1; i >= 0; i--)
                Release(_live[i]);
        }

        /// <summary>Drops every reference (live + free) so GC can reclaim the elements. Call on world tear-down or when the owning panel is destroyed.</summary>
        public void Clear()
        {
            for (int i = _live.Count - 1; i >= 0; i--) Release(_live[i]);
            _free.Clear();
            _liveCount.Value = 0;
        }

        public void Dispose()
        {
            Clear();
            _acquired.Dispose();
            _released.Dispose();
            _liveCount.Dispose();
        }
    }
}
