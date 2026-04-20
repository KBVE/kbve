using System.Threading;
using Cysharp.Text;
using Cysharp.Threading.Tasks;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Settings-panel tab — Go-to-coordinate + Find-biome (async, cancellable).</summary>
    public class SearchTab : ISettingsTab
    {
        const float HexSize = 0.25f;
        const int DefaultRadius = 200;
        const int MaxRadius = 2000;
        const int YieldEvery = 1024;

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

        readonly LocaleService _locale;
        readonly CameraService _camera;
        readonly BiomeGenerator _biomes;

        TextField _qField, _rField, _radiusField;
        DropdownField _biomeDropdown;
        Button _goButton, _findButton, _cancelButton;
        Label _resultLabel;
        CancellationTokenSource _searchCts;

        public string Title => "Search";

        public SearchTab(LocaleService locale, CameraService camera, BiomeGenerator biomes)
        {
            _locale = locale;
            _camera = camera;
            _biomes = biomes;
        }

        public VisualElement Build()
        {
            var root = new VisualElement();

            var gotoHeading = UIStyles.MakeHeading("Go to Coordinate", fontSize: 13);
            gotoHeading.style.marginBottom = 6;
            root.Add(gotoHeading);

            var gotoRow = new VisualElement();
            gotoRow.style.flexDirection = FlexDirection.Row;
            gotoRow.style.alignItems = Align.Center;

            _qField = new TextField("Q") { value = "0" };
            _qField.style.width = 90;
            _qField.style.marginRight = 6;
            _rField = new TextField("R") { value = "0" };
            _rField.style.width = 90;
            _rField.style.marginRight = 6;

            _goButton = UIStyles.MakeButton("Go", OnGoClicked);
            _goButton.style.height = 26;
            _goButton.style.flexGrow = 1;

            gotoRow.Add(_qField);
            gotoRow.Add(_rField);
            gotoRow.Add(_goButton);
            root.Add(gotoRow);

            root.Add(UIStyles.MakeStrip(thickness: 1));

            var findHeading = UIStyles.MakeHeading("Find Biome", fontSize: 13);
            findHeading.style.marginTop = 8;
            findHeading.style.marginBottom = 6;
            root.Add(findHeading);

            var biomeNames = new System.Collections.Generic.List<string>(SearchableBiomes.Length);
            foreach (var id in SearchableBiomes)
                biomeNames.Add(_locale.GetBiomeName(id));

            _biomeDropdown = new DropdownField("Biome", biomeNames, 0);
            _biomeDropdown.style.marginBottom = 6;
            root.Add(_biomeDropdown);

            var findRow = new VisualElement();
            findRow.style.flexDirection = FlexDirection.Row;
            findRow.style.alignItems = Align.Center;

            _radiusField = new TextField("Radius") { value = DefaultRadius.ToString() };
            _radiusField.style.width = 130;
            _radiusField.style.marginRight = 6;

            _findButton = UIStyles.MakeButton("Find", OnFindClicked);
            _findButton.style.height = 26;
            _findButton.style.flexGrow = 1;

            _cancelButton = UIStyles.MakeButton("Cancel", OnCancelClicked);
            _cancelButton.style.height = 26;
            _cancelButton.style.marginLeft = 6;
            _cancelButton.style.borderTopColor = UIStyles.Palette.Alert;
            _cancelButton.style.borderBottomColor = UIStyles.Palette.Alert;
            _cancelButton.style.borderLeftColor = UIStyles.Palette.Alert;
            _cancelButton.style.borderRightColor = UIStyles.Palette.Alert;
            _cancelButton.style.color = UIStyles.Palette.Alert;
            _cancelButton.style.display = DisplayStyle.None;

            findRow.Add(_radiusField);
            findRow.Add(_findButton);
            findRow.Add(_cancelButton);
            root.Add(findRow);

            _resultLabel = new Label("");
            _resultLabel.style.color = UIStyles.Palette.TextMuted;
            _resultLabel.style.fontSize = 12;
            _resultLabel.style.marginTop = 8;
            _resultLabel.style.whiteSpace = WhiteSpace.Normal;
            root.Add(_resultLabel);

            return root;
        }

        public void OnActivated() { }

        void OnGoClicked()
        {
            if (!int.TryParse(_qField.value, out int q) || !int.TryParse(_rField.value, out int r))
            {
                _resultLabel.text = "Q and R must be integers.";
                return;
            }
            var world = HexMeshUtil.HexToWorld(q, r, HexSize);
            _camera.JumpTo(new float2(world.x, world.y));
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

            var cam = _camera.Camera;
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
                _camera.JumpTo(new float2(world.x, world.y));
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
            _searchCts = null;
        }
    }
}
