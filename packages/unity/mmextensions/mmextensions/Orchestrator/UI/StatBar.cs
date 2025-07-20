using UnityEngine;
using UnityEngine.UI;
using TMPro;
using R3;
using KBVE.MMExtensions.Orchestrator.Health;
using System;


namespace KBVE.MMExtensions.Orchestrator.Core.UI
{
    public class StatBar : MonoBehaviour, IDisposable
    {
        private Image _fill;
        private TextMeshProUGUI _label;
        private StatType _type;
        private IDisposable _subscription;

        public void SetUIReferences(Image fill, TextMeshProUGUI label)
        {
            _fill = fill;
            _label = label;
        }

        public void Bind(StatObservable stat)
        {
            Dispose();

            _type = stat.Type;
            _label.text = stat.Type.ToString();
            _fill.color = StatHelper.GetStatColor(_type);

            _subscription = stat.Current
                    .CombineLatest(stat.Max, (cur, max) =>
                        {
                            float percent = (max <= 0f) ? 0f : cur / max;
                            _label.text = $"{_type}: {Mathf.FloorToInt(cur)} / {Mathf.FloorToInt(max)}";
                            return Mathf.Clamp01(percent);
                        })
                    .Subscribe(val =>
                        {
                            Debug.Log($"[StatBar] {_type} updated fill: {val}");
                            if (_fill != null)
                            {
                                _fill.fillAmount = val;
                                _fill.SetVerticesDirty();
                            }
                        });
        }

        public void Dispose()
        {
            _subscription?.Dispose();
            _subscription = null;
        }

        private void OnDestroy()
        {
            Dispose();
        }
    }
}