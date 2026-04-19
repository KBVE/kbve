using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>
    /// Reports whether a screen-space point sits over a pickable UI element.
    /// Consumers (input adapters, mouse state) call IsPointerOverUi each frame.
    /// </summary>
    public interface IUiPointerBlocker
    {
        bool IsPointerOverUi(Vector2 screenPos);
        void Register(UIDocument doc);
        void Unregister(UIDocument doc);
    }

    /// <summary>
    /// UI Toolkit implementation. Documents register themselves on enable so we
    /// avoid scanning the scene every frame and avoid a hidden static cache.
    /// </summary>
    public sealed class UiToolkitPointerBlocker : IUiPointerBlocker
    {
        readonly List<UIDocument> _documents = new();

        public void Register(UIDocument doc)
        {
            if (doc != null && !_documents.Contains(doc))
                _documents.Add(doc);
        }

        public void Unregister(UIDocument doc)
        {
            _documents.Remove(doc);
        }

        public bool IsPointerOverUi(Vector2 screenPos)
        {
            var flipped = new Vector2(screenPos.x, Screen.height - screenPos.y);

            for (int i = 0; i < _documents.Count; i++)
            {
                var doc = _documents[i];
                if (doc == null || doc.rootVisualElement == null) continue;
                var panel = doc.rootVisualElement.panel;
                if (panel == null) continue;

                var panelPos = RuntimePanelUtils.ScreenToPanel(panel, flipped);
                var picked = panel.Pick(panelPos);

                if (picked != null
                    && picked != doc.rootVisualElement
                    && picked.pickingMode == PickingMode.Position)
                {
                    return true;
                }
            }
            return false;
        }
    }
}
