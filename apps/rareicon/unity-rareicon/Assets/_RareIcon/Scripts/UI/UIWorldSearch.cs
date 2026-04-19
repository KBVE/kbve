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
            BiomeGenerator.BIOME_LAKE,
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
            _root = new VisualElement();
            _root.style.position = Position.Absolute;
            _root.style.top = new Length(2, LengthUnit.Percent);
            _root.style.right = new Length(2, LengthUnit.Percent);
            _root.style.width = 320;
            _root.style.backgroundColor = new Color(0.06f, 0.08f, 0.14f, 0.96f);
            _root.style.paddingTop = 12;
            _root.style.paddingBottom = 12;
            _root.style.paddingLeft = 14;
            _root.style.paddingRight = 14;
            _root.style.borderTopLeftRadius = 8;
            _root.style.borderTopRightRadius = 8;
            _root.style.borderBottomLeftRadius = 8;
            _root.style.borderBottomRightRadius = 8;
            var border = new Color(0.3f, 0.55f, 0.85f, 0.7f);
            _root.style.borderTopColor = border;
            _root.style.borderBottomColor = border;
            _root.style.borderLeftColor = border;
            _root.style.borderRightColor = border;
            _root.style.borderTopWidth = 1;
            _root.style.borderBottomWidth = 1;
            _root.style.borderLeftWidth = 1;
            _root.style.borderRightWidth = 1;
            // Stop world clicks from leaking through the panel area.
            _root.RegisterCallback<ClickEvent>(e => e.StopPropagation());

            // Title row
            var titleRow = new VisualElement();
            titleRow.style.flexDirection = FlexDirection.Row;
            titleRow.style.justifyContent = Justify.SpaceBetween;
            titleRow.style.alignItems = Align.Center;
            titleRow.style.marginBottom = 10;

            var title = new Label("World Search");
            title.style.color = Color.white;
            title.style.fontSize = 16;
            title.style.unityFontStyleAndWeight = FontStyle.Bold;

            _closeButton = new Button(Close) { text = "×" };
            _closeButton.style.width = 24;
            _closeButton.style.height = 24;
            _closeButton.style.fontSize = 16;
            _closeButton.style.backgroundColor = new Color(0.25f, 0.25f, 0.30f, 1f);
            _closeButton.style.color = Color.white;

            titleRow.Add(title);
            titleRow.Add(_closeButton);
            _root.Add(titleRow);

            BuildGotoSection();
            BuildDivider();
            BuildSearchSection();

            _resultLabel = new Label("");
            _resultLabel.style.color = new Color(0.75f, 0.85f, 0.95f, 1f);
            _resultLabel.style.fontSize = 12;
            _resultLabel.style.marginTop = 8;
            _resultLabel.style.whiteSpace = WhiteSpace.Normal;
            _root.Add(_resultLabel);

            parent.Add(_root);
            _root.style.display = DisplayStyle.None;
        }

        void BuildGotoSection()
        {
            var heading = new Label("Go to Coordinate");
            heading.style.color = new Color(0.65f, 0.80f, 0.95f, 1f);
            heading.style.fontSize = 13;
            heading.style.unityFontStyleAndWeight = FontStyle.Bold;
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

            _goButton = new Button(OnGoClicked) { text = "Go" };
            _goButton.style.height = 26;
            _goButton.style.flexGrow = 1;
            _goButton.style.backgroundColor = new Color(0.20f, 0.45f, 0.30f, 1f);
            _goButton.style.color = Color.white;

            row.Add(_qField);
            row.Add(_rField);
            row.Add(_goButton);
            _root.Add(row);
        }

        void BuildSearchSection()
        {
            var heading = new Label("Find Biome");
            heading.style.color = new Color(0.65f, 0.80f, 0.95f, 1f);
            heading.style.fontSize = 13;
            heading.style.unityFontStyleAndWeight = FontStyle.Bold;
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

            _findButton = new Button(OnFindClicked) { text = "Find" };
            _findButton.style.height = 26;
            _findButton.style.flexGrow = 1;
            _findButton.style.backgroundColor = new Color(0.20f, 0.40f, 0.65f, 1f);
            _findButton.style.color = Color.white;

            _cancelButton = new Button(OnCancelClicked) { text = "Cancel" };
            _cancelButton.style.height = 26;
            _cancelButton.style.marginLeft = 6;
            _cancelButton.style.backgroundColor = new Color(0.40f, 0.20f, 0.20f, 1f);
            _cancelButton.style.color = Color.white;
            _cancelButton.style.display = DisplayStyle.None;

            row.Add(_radiusField);
            row.Add(_findButton);
            row.Add(_cancelButton);
            _root.Add(row);
        }

        void BuildDivider()
        {
            var divider = new VisualElement();
            divider.style.height = 1;
            divider.style.backgroundColor = new Color(0.3f, 0.4f, 0.55f, 0.5f);
            divider.style.marginTop = 10;
            divider.style.marginBottom = 10;
            _root.Add(divider);
        }

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
