using ObservableCollections;
using KBVE.MMExtensions.Orchestrator.Health;
using Cysharp.Threading.Tasks;
using System.Collections.Generic;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.Core.UI
{
    public interface IHUDService
    {
        ObservableList<StatObservable> ReactiveStats { get; }

        GameObject HUDPanel { get; }
        UniTask SetActiveStatsAsync(Dictionary<StatType, StatData> statMap);
        void UpdateStat(StatType type, StatData data);
        StatObservable GetObservable(StatType type);
        void ClearStats();
    }
}