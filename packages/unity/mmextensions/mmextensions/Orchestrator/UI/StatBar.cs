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
        private IDisposable _sub;

        public void SetUIReferences(Image fill, TextMeshProUGUI label)
        {
            _fill = fill;
            _label = label;
        }

        public void Bind(StatObservable stat)
        {
            _type = stat.Type;
            _label.text = stat.Type.ToString();

            _sub?.Dispose();
            _sub = stat.Current
                .CombineLatest(stat.Max, (cur, max) => cur / Mathf.Max(max, 1f))
                .Subscribe(val => _fill.fillAmount = val);
        }

        public void Dispose()
        {
            _sub?.Dispose();
            _sub = null;
        }

        private void OnDestroy()
        {
            Dispose();
        }
    }
}