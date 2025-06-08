using UnityEngine;
using UnityEngine.UI;
using TMPro;
using R3;
using KBVE.MMExtensions.Orchestrator.Health;
using System;
using Cysharp.Threading.Tasks;


namespace KBVE.MMExtensions.Orchestrator.Core.UI
{
    public class StatDisplay : MonoBehaviour, IDisposable
    {
        private Image _icon;
        private TextMeshProUGUI _label;

        private StatType _type;
        private IDisposable _sub;

        private CancellationTokenSource _iconCts;


        public void SetUIReferences(Image icon, TextMeshProUGUI label)
        {
            _icon = icon;
            _label = label;
        }

        public void Bind(StatObservable stat)
        {
            _type = stat.Type;
            _label.text = FormatText(_type, stat.Current.Value);

            _sub?.Dispose();
            _sub = stat.Current
                .Subscribe(cur =>
                {
                    _label.text = FormatText(_type, cur);
                });

            LoadIconAsync(_type).Forget();
        }

        private async UniTaskVoid LoadIconAsync(StatType stat)
        {
            _iconCts?.Cancel();
            _iconCts = new CancellationTokenSource();
            try
            {
                var icon = await StatHelper.LoadStatIconAsync(stat).AttachExternalCancellation(_iconCts.Token);
                if (icon != null && _icon != null)
                    _icon.sprite = icon;
            }
            catch (OperationCanceledException)
            {
                // expected if switching character or destroying UI
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[StatDisplay] Failed to load icon for {stat}: {ex.Message}");
            }
        }

        private static string FormatText(StatType type, float value)
        {
            return $"{StatHelper.GetLabel(type)}: {value:F0}";
        }

        public void Dispose()
        {
            _sub?.Dispose();
            _sub = null;
            _iconCts?.Cancel();
            _iconCts?.Dispose();
            _iconCts = null;
        }

        private void OnDestroy()
        {
            Dispose();
        }
    }

}