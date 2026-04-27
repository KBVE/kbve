using System;
using MessagePipe;
using TMPro;
using Unity.Entities;
using UnityEngine;
using UnityEngine.UI;
using VContainer;

namespace RareIcon
{
    public sealed class ItemDetailsModal : MonoBehaviour
    {
        const string WebsiteUrlBase = "https://kbve.com/itemdb/";

        [Header("Bindings")]
        [SerializeField] CanvasGroup _root;
        [SerializeField] RawImage    _icon;
        [SerializeField] TMP_Text    _name;
        [SerializeField] TMP_Text    _typeBadge;
        [SerializeField] TMP_Text    _description;
        [SerializeField] TMP_Text    _lore;
        [SerializeField] TMP_Text    _stats;
        [SerializeField] Button      _externalLink;
        [SerializeField] Button      _close;
        [SerializeField] Button      _backdrop;

        ISubscriber<ItemInspectMessage> _inspectSub;
        IDisposable _sub;
        string _currentRef;

        [Inject]
        public void Construct(ISubscriber<ItemInspectMessage> inspectSub)
        {
            _inspectSub = inspectSub;
        }

        void Awake()
        {
            if (_close     != null) _close.onClick.AddListener(Hide);
            if (_backdrop  != null) _backdrop.onClick.AddListener(Hide);
            if (_externalLink != null) _externalLink.onClick.AddListener(OpenWebsite);
            SetVisible(false);
        }

        void OnEnable()
        {
            if (_inspectSub != null) _sub = _inspectSub.Subscribe(m => Show(m.ItemId));
        }

        void OnDisable() { _sub?.Dispose(); _sub = null; }

        public void Show(ushort itemId)
        {
            var em = World.DefaultGameObjectInjectionWorld?.EntityManager ?? default;
            if (_icon != null) ItemSpriteAtlasOps.TryApplyToRawImage(em, _icon, itemId);

            ItemDBDef def = null;
            if (ItemDBCache.TryGetByKey(itemId, out var byKey)) def = byKey;

            string displayName = def?.Name ?? ItemDB.GetNameKey(itemId);
            string ref_        = def?.Ref;
            string description = def?.Description ?? string.Empty;
            string lore        = def?.Lore        ?? string.Empty;
            string rarity      = def?.Rarity      ?? string.Empty;

            if (_name        != null) _name.text        = displayName;
            if (_typeBadge   != null) _typeBadge.text   = string.IsNullOrEmpty(rarity) ? string.Empty : rarity;
            if (_description != null) _description.text = description;
            if (_lore        != null)
            {
                _lore.text = lore;
                _lore.gameObject.SetActive(!string.IsNullOrEmpty(lore));
            }
            if (_stats != null) _stats.text = BuildStatsLine(itemId, def);

            _currentRef = ref_;
            if (_externalLink != null) _externalLink.gameObject.SetActive(!string.IsNullOrEmpty(_currentRef));

            SetVisible(true);
        }

        public void Hide() => SetVisible(false);

        void OpenWebsite()
        {
            if (string.IsNullOrEmpty(_currentRef)) return;
            Application.OpenURL(WebsiteUrlBase + _currentRef + "/");
        }

        void SetVisible(bool on)
        {
            if (_root != null)
            {
                _root.alpha = on ? 1f : 0f;
                _root.interactable   = on;
                _root.blocksRaycasts = on;
            }
            else
            {
                gameObject.SetActive(on);
            }
        }

        static string BuildStatsLine(ushort itemId, ItemDBDef def)
        {
            if (!ItemDB.TryGet(itemId, out var data)) return string.Empty;
            var sb = new System.Text.StringBuilder(96);
            if (data.RestoreHealth > 0f) sb.Append($"+{data.RestoreHealth:0} HP   ");
            if (data.RestoreEnergy > 0f) sb.Append($"+{data.RestoreEnergy:0} EN   ");
            if (data.RestoreMana   > 0f) sb.Append($"+{data.RestoreMana:0} MP   ");
            if (data.HarvestRole != HarvestRole.None) sb.Append($"{data.HarvestRole}   ");
            if (data.StackMax > 1) sb.Append($"x{data.StackMax}   ");
            if (data.Perishable && data.ShelfLifeSeconds > 0)
            {
                int hours = (int)(data.ShelfLifeSeconds / 3600u);
                sb.Append(hours > 0 ? $"{hours}h shelf" : $"{data.ShelfLifeSeconds}s shelf");
            }
            return sb.ToString().TrimEnd();
        }
    }
}
