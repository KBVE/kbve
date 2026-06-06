using UnityEngine;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Drives responsive breakpoint classes on a panel + its children. Subscribes to <see cref="GeometryChangedEvent"/> on the panel as a tick source, but reads <see cref="Screen.width"/> for the breakpoint decision so toggling <c>is-narrow</c> / <c>is-wide</c> classes never feeds back into the panel's own width and triggers Unity's "recursive layout" warning. State-change gate guarantees <c>AddToClassList</c> only runs on transitions, not every tick.</summary>
    public sealed class BuildingPanelLayout
    {
        public const float NarrowBreakpoint = 640f;
        public const float WideBreakpoint   = 1280f;

        readonly VisualElement _root;
        readonly VisualElement _rowsHost;
        int _state = -1;

        public BuildingPanelLayout(VisualElement root, VisualElement rowsHost = null)
        {
            _root     = root;
            _rowsHost = rowsHost;
            if (_root == null) return;
            _root.RegisterCallback<GeometryChangedEvent>(OnGeometryChanged);
        }

        void OnGeometryChanged(GeometryChangedEvent _)
        {
            float w = Screen.width;
            if (w <= 0f) return;

            int next = w <  NarrowBreakpoint ? 1
                     : w >= WideBreakpoint   ? 2
                     :                         0;
            if (next == _state) return;
            _state = next;

            Toggle(_root, "is-narrow", next == 1);
            Toggle(_root, "is-wide",   next == 2);

            if (_rowsHost == null) return;
            for (int i = 0; i < _rowsHost.childCount; i++)
            {
                Toggle(_rowsHost[i], "is-narrow", next == 1);
                Toggle(_rowsHost[i], "is-wide",   next == 2);
            }
        }

        static void Toggle(VisualElement e, string cls, bool on)
        {
            if (e == null) return;
            if (on) e.AddToClassList(cls);
            else    e.RemoveFromClassList(cls);
        }
    }
}
