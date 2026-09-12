using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Reusable tab strip + content host for building inspector panels. Each tab owns its own <see cref="VisualElement"/>; only the active tab is visible. Add tabs procedurally so callers (Goblin Cave, Capital, future structures) opt in to the tabs they need without touching shared UXML. Styling matches the rest of the inspector chrome (zinc surfaces, gold accents, sharp YoRHA corners) via <see cref="UIStyles.Palette"/>.</summary>
    public sealed class BuildingPanelTabs
    {
        readonly VisualElement _root;
        readonly VisualElement _strip;
        readonly VisualElement _stage;
        readonly List<TabEntry> _tabs = new();

        int _activeIndex = -1;

        public VisualElement Root => _root;

        public BuildingPanelTabs()
        {
            _root = new VisualElement { name = "tabs-root" };
            _root.style.flexDirection = FlexDirection.Column;
            _root.style.marginTop = 4;
            _root.style.flexGrow = 1f;
            _root.pickingMode = PickingMode.Position;

            _strip = new VisualElement { name = "tabs-strip" };
            _strip.style.flexDirection = FlexDirection.Row;
            _strip.style.flexWrap = Wrap.Wrap;
            _strip.style.marginBottom = 4;
            _root.Add(_strip);

            _stage = new VisualElement { name = "tabs-stage" };
            _stage.style.flexDirection = FlexDirection.Column;
            _stage.style.flexGrow = 1f;
            _root.Add(_stage);
        }

        /// <summary>Append a new tab. <paramref name="content"/> is reparented into the tab stage and shown only when this tab is active.</summary>
        public void AddTab(string id, string label, VisualElement content)
        {
            if (string.IsNullOrEmpty(id) || content == null) return;

            var btn = new Button { name = $"tab-{id}", text = label };
            btn.style.marginRight = 4;
            btn.style.marginBottom = 2;
            btn.style.paddingLeft = 8;
            btn.style.paddingRight = 8;
            btn.style.paddingTop = 4;
            btn.style.paddingBottom = 4;
            btn.style.fontSize = 12;
            btn.style.color = UIStyles.Palette.TextPrimary;
            btn.style.backgroundColor = UIStyles.Palette.ButtonBg;
            btn.style.borderTopLeftRadius = 0;
            btn.style.borderTopRightRadius = 0;
            btn.style.borderBottomLeftRadius = 0;
            btn.style.borderBottomRightRadius = 0;
            btn.style.borderTopWidth = 1;
            btn.style.borderBottomWidth = 1;
            btn.style.borderLeftWidth = 1;
            btn.style.borderRightWidth = 1;
            btn.style.borderTopColor = UIStyles.Palette.BorderSubtle;
            btn.style.borderBottomColor = UIStyles.Palette.BorderSubtle;
            btn.style.borderLeftColor = UIStyles.Palette.BorderSubtle;
            btn.style.borderRightColor = UIStyles.Palette.BorderSubtle;
            int idx = _tabs.Count;
            btn.clicked += () => Activate(idx);

            content.style.flexGrow = 1f;
            content.style.display = DisplayStyle.None;

            _strip.Add(btn);
            _stage.Add(content);
            _tabs.Add(new TabEntry { Id = id, Button = btn, Content = content });

            if (_activeIndex < 0) Activate(0);
        }

        public void SetTabVisible(string id, bool visible)
        {
            int idx = IndexOf(id);
            if (idx < 0) return;
            _tabs[idx].Button.style.display = visible ? DisplayStyle.Flex : DisplayStyle.None;
            if (!visible && idx == _activeIndex)
                ActivateFirstVisible();
            else if (visible && _activeIndex < 0)
                Activate(idx);
        }

        public bool TryActivate(string id)
        {
            int idx = IndexOf(id);
            if (idx < 0) return false;
            Activate(idx);
            return true;
        }

        public string ActiveId => _activeIndex >= 0 ? _tabs[_activeIndex].Id : null;

        void Activate(int idx)
        {
            if (idx < 0 || idx >= _tabs.Count) return;
            for (int i = 0; i < _tabs.Count; i++)
            {
                bool on = i == idx;
                _tabs[i].Content.style.display = on ? DisplayStyle.Flex : DisplayStyle.None;
                _tabs[i].Button.style.color = on ? UIStyles.Palette.GoldBright : UIStyles.Palette.TextPrimary;
                _tabs[i].Button.style.backgroundColor = on ? UIStyles.Palette.Zinc800 : UIStyles.Palette.ButtonBg;
                var borderColor = on ? UIStyles.Palette.GoldDeep : UIStyles.Palette.BorderSubtle;
                _tabs[i].Button.style.borderTopColor = borderColor;
                _tabs[i].Button.style.borderBottomColor = borderColor;
                _tabs[i].Button.style.borderLeftColor = borderColor;
                _tabs[i].Button.style.borderRightColor = borderColor;
            }
            _activeIndex = idx;
        }

        void ActivateFirstVisible()
        {
            for (int i = 0; i < _tabs.Count; i++)
            {
                if (_tabs[i].Button.style.display.value != DisplayStyle.None)
                {
                    Activate(i);
                    return;
                }
            }
            _activeIndex = -1;
        }

        int IndexOf(string id)
        {
            for (int i = 0; i < _tabs.Count; i++)
                if (_tabs[i].Id == id) return i;
            return -1;
        }

        struct TabEntry
        {
            public string Id;
            public Button Button;
            public VisualElement Content;
        }
    }
}
