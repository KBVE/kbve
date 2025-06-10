using UnityEngine;
using UnityEngine.UI;
using TMPro;
using R3;
using KBVE.MMExtensions.Orchestrator.Health;
using System;
using System.Threading;
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
        private CancellationTokenSource _pulseCts;


        private bool _isLow;
        private float _pulseSpeed = 2f;
        private float _alphaMin = 0.4f;
        private float _alphaMax = 1f;


        public void SetUIReferences(Image icon, TextMeshProUGUI label)
        {
            _icon = icon;
            _label = label;
        }

        public void Bind(StatObservable stat)
        {
            Dispose();

            _type = stat.Type;
            _label.text = FormatText(_type, stat.Current.Value);
            _icon.color = StatHelper.GetStatColor(_type);

            _sub = stat.Current
                .CombineLatest(stat.Max, (cur, max) => new { cur, max })
                .Subscribe(data =>
                {
                    _label.text = FormatText(_type, data.cur);

                    float percent = data.cur / Mathf.Max(data.max, 1f);
                    bool isNowLow = percent <= 0.25f;

                    if (isNowLow && !_isLow)
                    {
                        _isLow = true;
                        StartPulse();
                    }
                    else if (!isNowLow && _isLow)
                    {
                        _isLow = false;
                        StopPulse();
                    }
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

        private void StartPulse()
        {
            _pulseCts?.Cancel();
            _pulseCts = new CancellationTokenSource();
            var token = _pulseCts.Token;

            UniTask.Void(async () =>
            {
                try
                {
                    while (_isLow && _icon != null && !token.IsCancellationRequested)
                    {
                        float t = Mathf.PingPong(Time.time * _pulseSpeed, 1f);
                        float alpha = Mathf.Lerp(_alphaMin, _alphaMax, t);
                        var color = _icon.color;
                        color.a = alpha;
                        _icon.color = color;
                        await UniTask.NextFrame(token);
                    }
                }
                catch (OperationCanceledException) { }
            });
        }

        private void StopPulse()
        {
            _pulseCts?.Cancel();
            _pulseCts?.Dispose();
            _pulseCts = null;

            if (_icon != null)
            {
                var color = _icon.color;
                color.a = 1f;
                _icon.color = color;
            }
        }
        public void Dispose()
        {
            _sub?.Dispose();
            _sub = null;
            
            _iconCts?.Cancel();
            _iconCts?.Dispose();
            _iconCts = null;

            _pulseCts?.Cancel();
            _pulseCts?.Dispose();
            _pulseCts = null;
      
        }

        private void OnDestroy()
        {
            Dispose();
        }
    }

}