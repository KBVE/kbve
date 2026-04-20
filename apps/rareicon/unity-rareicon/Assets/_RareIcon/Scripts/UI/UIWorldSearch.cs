using System;
using System.Threading;
using Cysharp.Text;
using Cysharp.Threading.Tasks;
using R3;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>
    /// World tools panel — Go-to-coordinate and Find-biome (async, cancellable).
    /// Pooled VisualElement parented under UIPanelManager's UIDocument.
    /// Visibility owned via _isOpen; WorldHUD's Search button toggles it.
    /// </summary>
    public class UIWorldSearch : IAsyncStartable, IDisposable
    {
        const float HexSize = 0.25f;
        const int DefaultRadius = 200;
        const int MaxRadius = 2000;
        const int YieldEvery = 1024; // hexes per cancellation/yield check

        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly CameraService _cameraService;
        readonly BiomeGenerator _biomes;

        readonly CompositeDisposable _disposables = new();
        readonly ReactiveProperty<bool> _isOpen = new(false);
        public ReadOnlyReactiveProperty<bool> IsOpen => _isOpen;

        VisualElement _root;
        TextField _qField, _rField, _radiusField;
        DropdownField _biomeDropdown;
        Button _goButton, _findButton, _cancelButton, _closeButton;
        Label _resultLabel;

        CancellationTokenSource _searchCts;

        // Dropdown index → biome id (skips ocean since hex map doesn't render ocean tiles).
        static readonly byte[] SearchableBiomes = new byte[]
        {
            BiomeGenerator.BIOME_GRASS,
            BiomeGenerator.BIOME_FOREST,
            BiomeGenerator.BIOME_SAND,
            BiomeGenerator.BIOME_DIRT,
            BiomeGenerator.BIOME_SNOW,
            BiomeGenerator.BIOME_STONE,
            BiomeGenerator.BIOME_RIVER,
        };

        [Inject]
        public UIWorldSearch(
            LocaleService locale,
            UIPanelManager panelManager,
            CameraService cameraService,
            BiomeGenerator biomes)
        {
            _locale = locale;
            _panelManager = panelManager;
            _cameraService = cameraService;
            _biomes = biomes;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            var uiDoc = _panelManager.GetComponent<UIDocument>();
            if (uiDoc == null)
            {
                Debug.LogError("[UIWorldSearch] UIPanelManager has no UIDocument");
                return;
            }

            int waited = 0;
            while (uiDoc.rootVisualElement == null && waited < 1000)
            {
                await UniTask.Delay(50, cancellationToken: cancellation);
                waited += 50;
            }
            if (uiDoc.rootVisualElement == null)
            {
                Debug.LogError("[UIWorldSearch] rootVisualElement still null");
                return;
            }

            BuildUI(uiDoc.rootVisualElement);

            _isOpen
                .Subscribe(open => _root.style.display = open ? DisplayStyle.Flex : DisplayStyle.None)
                .AddTo(_disposables);
        }

        public void Toggle() => _isOpen.Value = !_isOpen.Value;
        public void Open()   => _isOpen.Value = true;
        public void Close()  => _isOpen.Value = false;

        void BuildUI(VisualElement parent)
        {
            _root = new VisualElement().ApplyPanelChrome(padV: 12, padH: 14);
            _root.style.AnchorTopRight();
            _root.style.width = 320;
            _root.style.display = DisplayStyle.None;
            // Stop world clicks from leaking through the panel area.
            _root.RegisterCallback<ClickEvent>(e => e.StopPropagation());

            // Title row — marker square + title on the left, × close button right.
            var titleRow = new VisualElement();
            titleRow.style.flexDirection = FlexDirection.Row;
            titleRow.style.justifyContent = Justify.SpaceBetween;
            titleRow.style.alignItems = Align.Center;
            titleRow.style.marginBottom = 8;

            titleRow.Add(UIStyles.MakeMarkerRow("World Search", fontSize: 16));

            _closeButton = UIStyles.MakeButton("\u00D7", Close);
            _closeButton.style.width = 24;
            _closeButton.style.height = 24;
            _closeButton.style.Padding(0);
            _closeButton.style.fontSize = 16;
            titleRow.Add(_closeButton);
            _root.Add(titleRow);
            _root.Add(UIStyles.MakeStrip());

            BuildGotoSection();
            BuildDivider();
            BuildSearchSection();

            _resultLabel = new Label("");
            _resultLabel.style.color = UIStyles.Palette.TextMuted;
            _resultLabel.style.fontSize = 12;
            _resultLabel.style.marginTop = 8;
            _resultLabel.style.whiteSpace = WhiteSpace.Normal;
            _root.Add(_resultLabel);

            parent.Add(_root);
        }

        void BuildGotoSection()
        {
            var heading = UIStyles.MakeHeading("Go to Coordinate", fontSize: 13);
            heading.style.marginBottom = 6;
            _root.Add(heading);

            var row = new VisualElement();
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems = Align.Center;

            _qField = new TextField("Q") { value = "0" };
            _qField.style.width = 90;
            _qField.style.marginRight = 6;
            _rField = new TextField("R") { value = "0" };
            _rField.style.width = 90;
            _rField.style.marginRight = 6;

            _goButton = UIStyles.MakeButton("Go", OnGoClicked);
            _goButton.style.height = 26;
            _goButton.style.flexGrow = 1;

            row.Add(_qField);
            row.Add(_rField);
            row.Add(_goButton);
            _root.Add(row);
        }

        void BuildSearchSection()
        {
            var heading = UIStyles.MakeHeading("Find Biome", fontSize: 13);
            heading.style.marginBottom = 6;
            _root.Add(heading);

            var biomeNames = new System.Collections.Generic.List<string>(SearchableBiomes.Length);
            foreach (var id in SearchableBiomes)
                biomeNames.Add(_locale.GetBiomeName(id));

            _biomeDropdown = new DropdownField("Biome", biomeNames, 0);
            _biomeDropdown.style.marginBottom = 6;
            _root.Add(_biomeDropdown);

            var row = new VisualElement();
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems = Align.Center;

            _radiusField = new TextField("Radius") { value = DefaultRadius.ToString() };
            _radiusField.style.width = 130;
            _radiusField.style.marginRight = 6;

            _findButton = UIStyles.MakeButton("Find", OnFindClicked);
            _findButton.style.height = 26;
            _findButton.style.flexGrow = 1;

            // Cancel uses the alert palette so it reads as a destructive action.
            _cancelButton = UIStyles.MakeButton("Cancel", OnCancelClicked);
            _cancelButton.style.height = 26;
            _cancelButton.style.marginLeft = 6;
            _cancelButton.style.borderTopColor = UIStyles.Palette.Alert;
            _cancelButton.style.borderBottomColor = UIStyles.Palette.Alert;
            _cancelButton.style.borderLeftColor = UIStyles.Palette.Alert;
            _cancelButton.style.borderRightColor = UIStyles.Palette.Alert;
            _cancelButton.style.color = UIStyles.Palette.Alert;
            _cancelButton.style.display = DisplayStyle.None;

            row.Add(_radiusField);
            row.Add(_findButton);
            row.Add(_cancelButton);
            _root.Add(row);
        }

        void BuildDivider() => _root.Add(UIStyles.MakeStrip(thickness: 1));

        void OnGoClicked()
        {
            if (!int.TryParse(_qField.value, out int q) || !int.TryParse(_rField.value, out int r))
            {
                _resultLabel.text = "Q and R must be integers.";
                return;
            }
            var world = HexMeshUtil.HexToWorld(q, r, HexSize);
            _cameraService.JumpTo(new float2(world.x, world.y));
            _resultLabel.text = ZString.Format("Jumped to ({0}, {1})", q, r);
        }

        void OnFindClicked()
        {
            if (!int.TryParse(_radiusField.value, out int radius) || radius <= 0)
            {
                _resultLabel.text = "Radius must be a positive integer.";
                return;
            }
            radius = math.min(radius, MaxRadius);

            byte targetBiome = SearchableBiomes[_biomeDropdown.index];
            string biomeName = _locale.GetBiomeName(targetBiome);

            _searchCts?.Cancel();
            _searchCts?.Dispose();
            _searchCts = new CancellationTokenSource();

            // Camera position read on main thread before spawning the task.
            var cam = _cameraService.Camera;
            var center = cam != null
                ? HexMeshUtil.WorldToHex(cam.transform.position.x, cam.transform.position.y, HexSize)
                : new int2(0, 0);

            ToggleSearchUI(searching: true);
            _resultLabel.text = ZString.Format("Searching {0} (radius {1})...", biomeName, radius);
            RunSearchAsync(center, radius, targetBiome, biomeName, _searchCts.Token).Forget();
        }

        async UniTaskVoid RunSearchAsync(int2 center, int radius, byte target, string biomeName, CancellationToken ct)
        {
            var (found, hex, scanned) = await UniTask.RunOnThreadPool(
                () => SearchSpiral(center, radius, target, ct),
                cancellationToken: ct);

            await UniTask.SwitchToMainThread();

            ToggleSearchUI(searching: false);

            if (ct.IsCancellationRequested)
            {
                _resultLabel.text = ZString.Format("Cancelled after {0} hexes.", scanned);
                return;
            }
            if (found)
            {
                int dist = HexMeshUtil.HexDistance(center, hex);
                var world = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
                _cameraService.JumpTo(new float2(world.x, world.y));
                _resultLabel.text = ZString.Format(
                    "{0} at ({1}, {2}) — {3} hexes away. Jumped.",
                    biomeName, hex.x, hex.y, dist);
            }
            else
            {
                _resultLabel.text = ZString.Format(
                    "No {0} found within radius {1} ({2} hexes scanned).",
                    biomeName, radius, scanned);
            }
        }

        (bool found, int2 hex, int scanned) SearchSpiral(int2 center, int radius, byte target, CancellationToken ct)
        {
            int scanned = 0;
            foreach (var hex in HexMeshUtil.Spiral(center, radius))
            {
                if ((scanned & (YieldEvery - 1)) == 0 && ct.IsCancellationRequested)
                    return (false, default, scanned);

                var world = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
                byte biome = _biomes.Sample(world.x, world.y);
                scanned++;
                if (biome == target)
                    return (true, hex, scanned);
            }
            return (false, default, scanned);
        }

        void OnCancelClicked() => _searchCts?.Cancel();

        void ToggleSearchUI(bool searching)
        {
            _findButton.SetEnabled(!searching);
            _findButton.style.display = searching ? DisplayStyle.None : DisplayStyle.Flex;
            _cancelButton.style.display = searching ? DisplayStyle.Flex : DisplayStyle.None;
            _qField.SetEnabled(!searching);
            _rField.SetEnabled(!searching);
            _goButton.SetEnabled(!searching);
            _biomeDropdown.SetEnabled(!searching);
            _radiusField.SetEnabled(!searching);
        }

        public void Dispose()
        {
            _searchCts?.Cancel();
            _searchCts?.Dispose();
            _disposables?.Dispose();
            _isOpen?.Dispose();
        }
    }
}
