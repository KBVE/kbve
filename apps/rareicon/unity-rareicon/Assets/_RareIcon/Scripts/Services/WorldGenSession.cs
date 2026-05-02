using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using R3;
using Unity.Mathematics;
using UnityEngine;

namespace RareIcon
{
    public enum TitleStage : byte
    {
        Info,
        Locale,
        Seed,
        Load,
        Generating,
        Ready,
    }

    /// <summary>Reactive title-screen state machine. Holds the player's locale + seed pick, drives background world prep (noise reseed → river routing → chunk streaming gate), and exposes a Ready signal so the title's Start button enables only once the world has streamed enough chunks to drop into. Owns the BiomeGenerator + ChunkGeneratorService + RiverRouter — the title screen flips them on after seed selection so chunks don't generate against the default seed before the player commits.</summary>
    public sealed class WorldGenSession : IDisposable
    {
        const int MinChunksReady = 9;
        const int RiverRoutingRadius = 200;

        readonly BiomeGenerator _biomes;
        readonly ChunkGeneratorService _chunks;
        readonly RiverRouter _rivers;
        readonly LocaleService _locale;

        readonly ReactiveProperty<TitleStage> _stage = new(TitleStage.Info);
        readonly ReactiveProperty<int> _seed = new(unchecked((int)DateTime.UtcNow.Ticks));
        readonly ReactiveProperty<int> _chunksReady = new(0);

        public ReadOnlyReactiveProperty<TitleStage> Stage => _stage;
        public ReadOnlyReactiveProperty<int> Seed => _seed;
        public ReadOnlyReactiveProperty<int> ChunksReady => _chunksReady;
        public int RequiredChunks => MinChunksReady;

        /// <summary>Static gate read by initial-spawn ECS systems (King + Capital + heroes + initial goblin cluster) so they don't fire while the title screen is up. Flipped <c>true</c> by <see cref="MarkWorldStarted"/> on the player's Start click. Stays <c>true</c> for the rest of the session — re-entering the title is not supported (yet).</summary>
        public static bool HasStarted { get; private set; }

        public static void MarkWorldStarted() => HasStarted = true;

        CancellationTokenSource _genCts;

        public WorldGenSession(
            BiomeGenerator biomes,
            ChunkGeneratorService chunks,
            RiverRouter rivers,
            LocaleService locale)
        {
            _biomes = biomes;
            _chunks = chunks;
            _rivers = rivers;
            _locale = locale;
        }

        /// <summary>Move from the AoE-style menu (Info stage) into the single-player launch flow (Locale → Seed → Generating). No-op if a sub-stage is already active — generation in flight cannot be re-entered.</summary>
        public void BeginSinglePlayer()
        {
            if (_stage.Value == TitleStage.Info) _stage.Value = TitleStage.Locale;
        }

        /// <summary>Open the Continue / Load Save stage from the menu. Lists existing slots; clicking one routes through <see cref="LoadSlot"/>.</summary>
        public void BeginLoadFlow()
        {
            if (_stage.Value == TitleStage.Info) _stage.Value = TitleStage.Load;
        }

        /// <summary>Drop back to the AoE-style menu from the Load stage.</summary>
        public void BackFromLoad()
        {
            if (_stage.Value == TitleStage.Load) _stage.Value = TitleStage.Info;
        }

        /// <summary>Restore <paramref name="slot"/> into the live worldstore, seed the BiomeGenerator from the manifest, and advance to Generating. Returns false on validation / extraction / uniti-restore failure with the reason; the title screen surfaces it back to the player. Caller must handle the case where restoring overwrites a live SQLite handle — uniti's Restore swaps the file in place.</summary>
        public bool LoadSlot(string slot, out string failureReason)
        {
            failureReason = null;
            if (_stage.Value != TitleStage.Load)
            {
                failureReason = "load stage not active";
                return false;
            }

            string liveDb = WorldStoreSystem.LiveDbPath;
            if (!SaveSlotService.Restore(slot, liveDb, out failureReason))
                return false;

            // Pull the seed back from the slot's manifest so the biome
            // generator resumes against the same noise field the saved
            // world was rolled with. Legacy slots (no manifest) keep the
            // current seed so the world isn't visibly mismatched.
            var slotPath = SaveSlotService.PathForSlot(slot);
            if (SaveBundleIO.IsZipBundle(slotPath))
            {
                var manifest = SaveBundleIO.ReadManifest(slotPath);
                if (manifest != null) _seed.Value = manifest.Seed;
            }

            BeginGeneration();
            return true;
        }

        public void SelectLocale(string locale)
        {
            _locale.SetLocale(locale);
            if (_stage.Value == TitleStage.Locale) _stage.Value = TitleStage.Seed;
        }

        /// <summary>Drop back to the locale picker from the seed stage. No-op if generation has already started — there's no in-flight cancel for that path.</summary>
        public void BackToLocale()
        {
            if (_stage.Value == TitleStage.Seed) _stage.Value = TitleStage.Locale;
        }

        /// <summary>Return to the AoE-style menu (Info stage) from any pre-generation sub-stage. No-op once generation is in flight.</summary>
        public void BackToMenu()
        {
            if (_stage.Value == TitleStage.Locale
             || _stage.Value == TitleStage.Seed
             || _stage.Value == TitleStage.Load)
            {
                _stage.Value = TitleStage.Info;
            }
        }

        public void SetSeed(int seed) => _seed.Value = seed;

        public void Randomize() => _seed.Value = unchecked((int)DateTime.UtcNow.Ticks ^ UnityEngine.Random.Range(int.MinValue, int.MaxValue));

        /// <summary>Lock the seed in, kick off background world generation, and advance to the Generating stage. Idempotent — calling twice is a no-op.</summary>
        public void BeginGeneration()
        {
            if (_stage.Value == TitleStage.Generating || _stage.Value == TitleStage.Ready) return;

            _stage.Value = TitleStage.Generating;
            _biomes.Reseed(_seed.Value);

            _genCts?.Cancel();
            _genCts = new CancellationTokenSource();
            RunGenerationAsync(_genCts.Token).Forget();
        }

        async UniTaskVoid RunGenerationAsync(CancellationToken ct)
        {
            try
            {
                var rivers = await UniTask.RunOnThreadPool(
                    () => _rivers.RouteRegion(new int2(0, 0), RiverRoutingRadius),
                    cancellationToken: ct);

                if (ct.IsCancellationRequested) return;

                RiverSpawnSystem.SetRivers(rivers);
                HexChunkSystem.SetGenerator(_chunks);

                while (!ct.IsCancellationRequested)
                {
                    int produced = HexChunkSystem.LoadedChunkCountStatic + _chunks.ResultCount;
                    _chunksReady.Value = produced;
                    if (produced >= MinChunksReady) break;
                    await UniTask.Delay(100, cancellationToken: ct);
                }

                _stage.Value = TitleStage.Ready;
            }
            catch (OperationCanceledException) { }
            catch (Exception e) { Debug.LogError($"[WorldGenSession] generation failed: {e}"); }
        }

        public void Dispose()
        {
            _genCts?.Cancel();
            _genCts?.Dispose();
            _stage.Dispose();
            _seed.Dispose();
            _chunksReady.Dispose();
        }
    }
}
