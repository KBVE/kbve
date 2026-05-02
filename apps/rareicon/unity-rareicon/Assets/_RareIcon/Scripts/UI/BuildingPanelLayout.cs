using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Drives responsive breakpoint classes on a panel + its children. Subscribes to <see cref="GeometryChangedEvent"/> on the panel root and toggles <c>is-narrow</c> / <c>is-wide</c> classes whenever the resolved width crosses the configured pixel breakpoints. USS rules under <c>.panel--modal.is-narrow</c> / <c>.panel--modal.is-wide</c> reshape padding + flex direction so phone-class resolutions don't crush rows and 4K screens don't bleed to the edges. Also re-applies the same classes to optional row children so individual rows can rearrange independently of the parent panel.</summary>
    public sealed class BuildingPanelLayout
    {
        public const float NarrowBreakpoint = 640f;
        public const float WideBreakpoint   = 1280f;

        readonly VisualElement _root;
        readonly VisualElement _rowsHost;

        public BuildingPanelLayout(VisualElement root, VisualElement rowsHost = null)
        {
            _root     = root;
            _rowsHost = rowsHost;
            if (_root == null) return;
            _root.RegisterCallback<GeometryChangedEvent>(OnGeometryChanged);
        }

        void OnGeometryChanged(GeometryChangedEvent evt)
        {
            float w = evt.newRect.width;
            if (w <= 0f) return;

            bool narrow = w < NarrowBreakpoint;
            bool wide   = w >= WideBreakpoint;

            Toggle(_root, "is-narrow", narrow);
            Toggle(_root, "is-wide",   wide);

            if (_rowsHost == null) return;
            for (int i = 0; i < _rowsHost.childCount; i++)
            {
                Toggle(_rowsHost[i], "is-narrow", narrow);
                Toggle(_rowsHost[i], "is-wide",   wide);
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
