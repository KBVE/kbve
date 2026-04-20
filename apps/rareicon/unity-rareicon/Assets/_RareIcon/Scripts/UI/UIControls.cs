using System;
using UnityEngine;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Composed behavioural widgets layered on top of UIStyles primitives; reuse across panels so we don't re-invent stepper rows / tab layouts.</summary>
    public static class UIControls
    {
        /// <summary>Return handle for a stepper row. SetValue drives both the label AND the stepper's internal state so the next +/- click increments from the displayed value, not from whatever the initial parameter was at build time. Does not re-fire onChange — callers updating from data already hold the value.</summary>
        public readonly struct StepperHandle
        {
            public readonly VisualElement Row;
            public readonly Label Value;
            public readonly Button Minus;
            public readonly Button Plus;
            readonly Action<int> _setValue;

            public StepperHandle(VisualElement row, Label value, Button minus, Button plus, Action<int> setValue)
            {
                Row = row; Value = value; Minus = minus; Plus = plus; _setValue = setValue;
            }

            public void SetValue(int v) => _setValue?.Invoke(v);
        }

        /// <summary>Label + [−] [value] [+] row clamped to [min, max]. Invokes onChange with the new value after each click.</summary>
        public static StepperHandle MakeStepperRow(string label, int initial, int min, int max,
                                                   Action<int> onChange,
                                                   int labelWidth = 0)
        {
            var row = new VisualElement();
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems = Align.Center;
            row.style.marginTop = 3;

            var labelEl = new Label(label);
            labelEl.style.color = UIStyles.Palette.TextStrong;
            labelEl.style.fontSize = 13;
            if (labelWidth > 0) labelEl.style.width = labelWidth;
            else labelEl.style.flexGrow = 1;
            row.Add(labelEl);

            int state = Mathf.Clamp(initial, min, max);

            Label valueLabel = null;
            Button minusBtn = null;
            Button plusBtn = null;

            void Sync()
            {
                valueLabel.text = state.ToString();
                minusBtn.SetEnabled(state > min);
                plusBtn.SetEnabled(state < max);
            }

            minusBtn = UIStyles.MakeButton("\u2212", () =>
            {
                if (state <= min) return;
                state -= 1;
                Sync();
                onChange?.Invoke(state);
            });
            minusBtn.style.width = 24; minusBtn.style.height = 22; minusBtn.style.fontSize = 14;
            row.Add(minusBtn);

            valueLabel = new Label(state.ToString());
            valueLabel.style.color = UIStyles.Palette.Gold;
            valueLabel.style.fontSize = 14;
            valueLabel.style.width = 24;
            valueLabel.style.unityTextAlign = TextAnchor.MiddleCenter;
            row.Add(valueLabel);

            plusBtn = UIStyles.MakeButton("+", () =>
            {
                if (state >= max) return;
                state += 1;
                Sync();
                onChange?.Invoke(state);
            });
            plusBtn.style.width = 24; plusBtn.style.height = 22; plusBtn.style.fontSize = 14;
            row.Add(plusBtn);

            void SetExternal(int v)
            {
                state = Mathf.Clamp(v, min, max);
                Sync();
            }

            Sync();
            return new StepperHandle(row, valueLabel, minusBtn, plusBtn, SetExternal);
        }

        /// <summary>Vertical sidebar tab button; active tab highlights with the gold fill / zinc text swap used elsewhere in the YoRHA theme.</summary>
        public static Button MakeSidebarTab(string label, bool isActive, Action onClick)
        {
            var btn = UIStyles.MakeButton(label, onClick);
            btn.style.height = 30;
            btn.style.fontSize = 13;
            btn.style.width = Length.Percent(100);
            btn.style.marginBottom = 4;
            btn.style.Padding(0, 10);
            btn.style.unityTextAlign = TextAnchor.MiddleLeft;
            ApplySidebarTabActive(btn, isActive);
            return btn;
        }

        public static void ApplySidebarTabActive(Button btn, bool isActive)
        {
            btn.style.backgroundColor = isActive ? UIStyles.Palette.Gold      : UIStyles.Palette.ButtonBg;
            btn.style.color           = isActive ? UIStyles.Palette.Zinc950   : UIStyles.Palette.Gold;
        }

        /// <summary>Two-column tab layout: vertical sidebar on the left, content host on the right. Returns the outer row; caller adds tabs to `sidebar` and swaps children in `content`.</summary>
        public static VisualElement MakeTabbedLayout(out VisualElement sidebar, out VisualElement content,
                                                     float sidebarWidth = 110f, float gap = 10f)
        {
            var row = new VisualElement();
            row.style.flexDirection = FlexDirection.Row;
            row.style.flexGrow = 1;

            sidebar = new VisualElement();
            sidebar.style.width = sidebarWidth;
            sidebar.style.marginRight = gap;
            row.Add(sidebar);

            content = new VisualElement();
            content.style.flexGrow = 1;
            row.Add(content);

            return row;
        }
    }
}
