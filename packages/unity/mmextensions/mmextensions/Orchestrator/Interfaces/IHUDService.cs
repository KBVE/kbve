using ObservableCollections;
using KBVE.MMExtensions.Orchestrator.Health;

namespace KBVE.MMExtensions.Orchestrator.Core.UI
{
    public interface IHUDService
    {
        ObservableList<StatObservable> ReactiveStats { get; }

        void SetActiveStats(Dictionary<StatType, StatData> statMap);
        void UpdateStat(StatType type, StatData data);
        StatObservable GetObservable(StatType type);
        void ClearStats();
    }
}