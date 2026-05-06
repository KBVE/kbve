using System;
using System.Collections.Generic;
using ObservableCollections;
using R3;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Generic delta-driven binder between an <see cref="IObservableCollection{T}"/> source and a <see cref="VisualElement"/> container. Subscribes to add/remove/reset events; on add rents an element from the pool, runs the bind callback, attaches to the container; on remove releases the rented element back. Internal <see cref="Dictionary{TKey,TValue}"/> keyed on the record gives O(1) remove resolution. Reusable across every list-shaped UI surface (lobby members, toast queue, building inspector slots, citizen tabs).</summary>
    public sealed class ObservableListView<TRecord, TElement> : IDisposable
        where TElement : VisualElement
    {
        readonly IObservableCollection<TRecord> _source;
        readonly VisualElement _container;
        readonly VisualElementPool<TElement> _pool;
        readonly Action<TRecord, TElement> _bind;
        readonly Dictionary<TRecord, TElement> _live;
        readonly CompositeDisposable _disposables = new();

        public IReadOnlyDictionary<TRecord, TElement> Live => _live;
        public int Count => _live.Count;

        public ObservableListView(
            IObservableCollection<TRecord> source,
            VisualElement container,
            VisualElementPool<TElement> pool,
            Action<TRecord, TElement> bind,
            IEqualityComparer<TRecord> comparer = null)
        {
            _source    = source ?? throw new ArgumentNullException(nameof(source));
            _container = container ?? throw new ArgumentNullException(nameof(container));
            _pool      = pool ?? throw new ArgumentNullException(nameof(pool));
            _bind      = bind ?? throw new ArgumentNullException(nameof(bind));
            _live      = comparer != null ? new Dictionary<TRecord, TElement>(comparer) : new Dictionary<TRecord, TElement>();

            foreach (var rec in _source) AddRow(rec);

            _source.ObserveAdd().Subscribe(ev => AddRow(ev.Value)).AddTo(_disposables);
            _source.ObserveRemove().Subscribe(ev => RemoveRow(ev.Value)).AddTo(_disposables);
            _source.ObserveReplace().Subscribe(ev => ReplaceRow(ev.OldValue, ev.NewValue)).AddTo(_disposables);
            _source.ObserveReset().Subscribe(_ => ClearRows()).AddTo(_disposables);
        }

        void AddRow(TRecord rec)
        {
            if (_live.ContainsKey(rec)) return;
            var el = _pool.Acquire();
            _bind(rec, el);
            _container.Add(el);
            _live[rec] = el;
        }

        void RemoveRow(TRecord rec)
        {
            if (!_live.TryGetValue(rec, out var el)) return;
            _live.Remove(rec);
            _pool.Release(el);
        }

        void ReplaceRow(TRecord oldRec, TRecord newRec)
        {
            if (_live.TryGetValue(oldRec, out var el))
            {
                _live.Remove(oldRec);
                _bind(newRec, el);
                _live[newRec] = el;
                return;
            }
            AddRow(newRec);
        }

        void ClearRows()
        {
            foreach (var kv in _live) _pool.Release(kv.Value);
            _live.Clear();
        }

        /// <summary>Force a re-bind of the current view — useful when the underlying records mutate in place (e.g. Steam display name resolved late) and the source collection didn't fire a change event.</summary>
        public void Rebind()
        {
            foreach (var kv in _live) _bind(kv.Key, kv.Value);
        }

        public void Dispose()
        {
            ClearRows();
            _disposables?.Dispose();
        }
    }
}
