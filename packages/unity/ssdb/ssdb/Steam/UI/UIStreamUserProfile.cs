using TMPro;
using UnityEngine;
using UnityEngine.UI;
using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using R3;

namespace KBVE.SSDB.Steam.UI
{

    public class UIStreamUserProfile : MonoBehaviour, IDisposable
    {


        [SerializeField] private Image avatarImage;
        [SerializeField] private TextMeshProUGUI nameText;
        [SerializeField] private TextMeshProUGUI statusText;
        [SerializeField] private GameObject skeletonPlaceholder;

        private readonly ReactiveProperty<string> _displayName = new(string.Empty);
        private readonly ReactiveProperty<string> _status = new(string.Empty);
        private readonly ReactiveProperty<Texture2D?> _avatar = new(null);
        private readonly ReactiveProperty<bool> _isLoading = new(true);

        private IDisposable _bindings;
        private Texture2D _lastAvatar;
        private CancellationTokenSource _cts;


        private void Awake()
        {
            // Reactive bindings
            _bindings = Disposable.Combine(
                _displayName.Subscribe(name => nameText.text = name),
                _status.Subscribe(status => statusText.text = status),
                _avatar.Subscribe(OnAvatarUpdated),
                _isLoading.Subscribe(isLoading =>
                {
                    if (skeletonPlaceholder != null)
                        skeletonPlaceholder.SetActive(isLoading);
                })
            );
        }

        public async UniTask BindAsync(SteamFriendViewModel viewModel)
        {
            _cts?.Cancel();
            _cts = new CancellationTokenSource();
            var token = _cts.Token;

            _isLoading.Value = true;
            _displayName.Value = viewModel.Name;
            _status.Value = viewModel.Status;

            try
            {
                var avatar = await viewModel.AvatarTask.AttachExternalCancellation(token);
                if (_lastAvatar != null)
                    UnityEngine.Object.Destroy(_lastAvatar);

                _lastAvatar = avatar;
                _avatar.Value = avatar;
            }
            catch (OperationCanceledException)
            {
                // Skip cancelled avatar load
            }
            finally
            {
                _isLoading.Value = false;
            }
        }

        private void OnAvatarUpdated(Texture2D? avatar)
        {
            if (avatarImage == null) return;

            if (avatar != null)
            {
                avatarImage.sprite = Sprite.Create(
                    avatar,
                    new Rect(0, 0, avatar.width, avatar.height),
                    new Vector2(0.5f, 0.5f));
            }
            else
            {
                avatarImage.sprite = null;
            }
        }

        public void Clear()
        {
            _displayName.Value = "";
            _status.Value = "";
            _avatar.Value = null;
            _isLoading.Value = true;
            _cts?.Cancel();
            _cts?.Dispose();
            _cts = null;
        }


        public void Dispose()
        {
            _bindings?.Dispose();
            _cts?.Cancel();
            _cts?.Dispose();
            _cts = null;

            if (_lastAvatar != null)
            {
                UnityEngine.Object.Destroy(_lastAvatar);
                _lastAvatar = null;
            }
        }

        private void OnDestroy()
        {
             Dispose();
        }


    }

    


}