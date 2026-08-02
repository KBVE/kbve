using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using UnityEngine;

namespace RareIcon
{
    public readonly struct GatherInfo
    {
        public readonly string Skill;
        public readonly byte HarvestWeight;

        public GatherInfo(string skill, byte harvestWeight)
        {
            Skill = skill;
            HarvestWeight = harvestWeight;
        }
    }

    public readonly struct CompressInfo
    {
        public readonly string TargetRef;
        public readonly int Ratio;

        public CompressInfo(string targetRef, int ratio)
        {
            TargetRef = targetRef;
            Ratio = ratio;
        }
    }

    public static class ProfessiondbCache
    {
        static readonly Dictionary<string, GatherInfo> _gatherByItem = new();
        static readonly Dictionary<string, CompressInfo> _compressByItem = new();

        public static bool IsLoaded { get; private set; }
        public static int GatherCount => _gatherByItem.Count;
        public static int CompressCount => _compressByItem.Count;

        public static bool TryGetGather(string itemRef, out GatherInfo info)
            => _gatherByItem.TryGetValue(itemRef, out info);

        public static bool TryGetCompress(string itemRef, out CompressInfo info)
            => _compressByItem.TryGetValue(itemRef, out info);

        public static void EnsureLoaded()
        {
            if (IsLoaded) return;

            string path = Path.Combine(Application.streamingAssetsPath, "professiondb-runtime.json");
            if (!File.Exists(path))
            {
                Debug.LogError($"[ProfessiondbLoader] professiondb-runtime.json missing at {path}. Run `npx nx run astro-kbve:sync:professiondb`. Gathering and storage consolidation stay disabled until present.");
                return;
            }

            string raw;
            try { raw = File.ReadAllText(path); }
            catch (IOException e)
            {
                Debug.LogError($"[ProfessiondbLoader] failed to read professiondb-runtime.json: {e.Message}");
                return;
            }

            ProfessiondbRuntime bundle;
            try { bundle = JsonConvert.DeserializeObject<ProfessiondbRuntime>(raw); }
            catch (JsonException e)
            {
                Debug.LogError($"[ProfessiondbLoader] failed to parse professiondb-runtime.json: {e.Message}");
                return;
            }

            if (bundle?.Professions == null || bundle.Professions.Count == 0)
            {
                Debug.LogError("[ProfessiondbLoader] professiondb-runtime.json had no professions");
                return;
            }

            Load(bundle);
            Debug.Log($"[ProfessiondbLoader] Loaded {bundle.Professions.Count} professions: {GatherCount} gatherable, {CompressCount} compressible item refs.");
        }

        public static void Load(ProfessiondbRuntime bundle)
        {
            Clear();
            foreach (var prof in bundle.Professions)
            {
                if (prof?.Actions == null) continue;
                foreach (var action in prof.Actions)
                {
                    if (action == null) continue;
                    bool hasInputs = action.Inputs != null && action.Inputs.Count > 0;
                    bool hasOutputs = action.Outputs != null && action.Outputs.Count > 0;

                    if (!hasInputs && hasOutputs)
                    {
                        string itemRef = action.Outputs[0].ItemRef;
                        if (string.IsNullOrEmpty(itemRef)) continue;
                        byte weight = action.HarvestWeight.HasValue
                            ? (byte)System.Math.Min(System.Math.Max(action.HarvestWeight.Value, 1), 255)
                            : (byte)100;
                        _gatherByItem[itemRef] = new GatherInfo(prof.Ref, weight);
                    }
                    else if (hasInputs && hasOutputs && action.Inputs.Count == 1 && action.Outputs.Count == 1)
                    {
                        string itemRef = action.Inputs[0].ItemRef;
                        string targetRef = action.Outputs[0].ItemRef;
                        if (string.IsNullOrEmpty(itemRef) || string.IsNullOrEmpty(targetRef)) continue;
                        _compressByItem[itemRef] = new CompressInfo(targetRef, action.Inputs[0].Quantity);
                    }
                }
            }
            IsLoaded = true;
        }

        public static void Clear()
        {
            _gatherByItem.Clear();
            _compressByItem.Clear();
            IsLoaded = false;
        }
    }
}
