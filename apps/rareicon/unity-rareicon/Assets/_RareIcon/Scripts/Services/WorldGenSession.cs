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

        readonly ReactiveProperty<TitleStage> _stage;
        readonly ReactiveProperty<int> _seed = new(unchecked((int)DateTime.UtcNow.Ticks));
        readonly ReactiveProperty<int> _chunksReady = new(0);

        public ReadOnlyReactiveProperty<TitleStage> Stage => _stage;
        public ReadOnlyReactiveProperty<int> Seed => _seed;
        public ReadOnlyReactiveProperty<int> ChunksReady => _chunksReady;
        public int RequiredChunks => MinChunksReady;

        /// <summary>Static gate read by initial-spawn ECS systems (King + Capital + heroes + initial goblin cluster) so they don't fire while the title screen is up. Flipped <c>true</c> by <see cref="MarkWorldStarted"/> on the player's Start click. Stays <c>true</c> for the rest of the session — re-entering the title is not supported (yet).</summary>
        public static bool HasStarted { get; private set; }

        public static void MarkWorldStarted() => HasStarted = true;

        /// <summary>Counterpart to <see cref="MarkWorldStarted"/> — flipped <c>false</c> by <see cref="WorldResetService"/> on Return-to-Title so the next play-through respawns the King + retinue + initial cluster cleanly.</summary>
        public static void MarkWorldEnded() => HasStarted = false;

        /// <summary>Resets the stage state machine back to a fresh title screen — used by the Return-to-Title flow so the player can pick a new seed without the system thinking generation is still in flight.</summary>
        public void ResetForNewRun()
        {
            _genCts?.Cancel();
            _genCts?.Dispose();
            _genCts = null;
            _chunksReady.Value = 0;
            _stage.Value = TitleStage.Info;
        }

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

            _stage = new ReactiveProperty<TitleStage>(
                _locale.HasUserPickedLocale ? TitleStage.Info : TitleStage.Locale);
        }

        /// <summary>Single-player launch flow — opens the Seed picker so the player can review / type a custom seed before world generation. Accepts any pre-generation stage so toggling from Continue / Locale works without a Back step. No-op once generation is already in flight.</summary>
        public void BeginSinglePlayer()
        {
            if (_stage.Value == TitleStage.Generating || _stage.Value == TitleStage.Ready) return;
            _stage.Value = TitleStage.Seed;
        }

        /// <summary>Quick-play one-click launch — rolls a random seed and routes straight into generation, skipping the Seed picker. Wired from the Welcome stage's QUICK PLAY card so the very first click after the title screen drops the player into a fresh run.</summary>
        public void BeginQuickPlay()
        {
            if (_stage.Value == TitleStage.Generating || _stage.Value == TitleStage.Ready) return;
            Randomize();
            BeginGeneration();
        }

        /// <summary>Open the Continue / Load Save stage. Accepts any pre-generation stage so toggling Continue from inside Seed / Locale works without first stepping back to the menu.</summary>
        public void BeginLoadFlow()
        {
            if (_stage.Value == TitleStage.Generating || _stage.Value == TitleStage.Ready) return;
            _stage.Value = TitleStage.Load;
        }

        /// <summary>Drop back to the AoE-style menu from the Load stage.</summary>
        public void BackFromLoad()
        {
            if (_stage.Value == TitleStage.Load) _stage.Value = TitleStage.Info;
        }

        /// <summary>Restore <paramref name="slot"/> into the live worldstore, seed the BiomeGenerator from the manifest, and advance to Generating. Routes through <see cref="WorldStoreSystem.RestoreSlotAndReopen"/> so the SQLite handle is closed before uniti rewrites the file (Windows holds exclusive locks; restoring without dispose+reopen would fail with "file in use"). Returns false with a reason on any step that rejects.</summary>
        public bool LoadSlot(string slot, out string failureReason)
        {
            failureReason = null;
            if (_stage.Value != TitleStage.Load && _stage.Value != TitleStage.Info)
            {
                failureReason = "load stage not active";
                return false;
            }

            if (!WorldStoreSystem.RestoreSlotAndReopen(slot, out failureReason))
                return false;

            var slotPath = SaveSlotService.PathForSlot(slot);
            if (SaveBundleIO.IsZipBundle(slotPath))
            {
                var manifest = SaveBundleIO.ReadManifest(slotPath);
                if (manifest != null) _seed.Value = manifest.Seed;
            }

            BeginGeneration();
            return true;
        }

        /// <summary>One-shot helper from the menu — pick the most recent save bundle (sorted newest-first by mtime in <see cref="SaveSlotService.ListSlotsWithMeta"/>) and route it through <see cref="LoadSlot"/>. No-op + returns false if no slots exist.</summary>
        public bool QuickContinue(out string failureReason)
        {
            failureReason = null;
            var slots = SaveSlotService.ListSlotsWithMeta();
            if (slots == null || slots.Length == 0)
            {
                failureReason = "no save slots";
                return false;
            }
            return LoadSlot(slots[0].Slot, out failureReason);
        }

        /// <summary>True when at least one save bundle exists on disk. Used by the menu to show / hide the Quick Continue affordance.</summary>
        public bool HasAnySlot
        {
            get
            {
                var slots = SaveSlotService.ListSlotsWithMeta();
                return slots != null && slots.Length > 0;
            }
        }

        /// <summary>Commit a locale from the first-boot Language picker. Persists via LocaleService and advances to the AoE menu (Info stage). Subsequent launches skip the picker outright.</summary>
        public void SelectLocale(string locale)
        {
            _locale.SetLocale(locale);
            if (_stage.Value == TitleStage.Locale) _stage.Value = TitleStage.Info;
        }

        /// <summary>Drop back to the locale picker from the seed stage. Kept for parity but unused now that the picker only appears on first boot — Single Player flow is Info → Seed without an intermediate Language step.</summary>
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
