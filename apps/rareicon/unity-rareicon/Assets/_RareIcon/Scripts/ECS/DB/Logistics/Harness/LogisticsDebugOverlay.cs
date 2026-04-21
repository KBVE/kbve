using Unity.Collections;
using Unity.Entities;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Runtime IMGUI overlay for the ECS/DB/Logistics subsystem. Auto-bootstraps a GameObject on scene load; toggles SyntheticProducerSystem.Enabled and renders CurrentAmounts / Reservations / PendingDeltas counts + top entries.</summary>
    public class LogisticsDebugOverlay : MonoBehaviour
    {
        const int MaxEntriesShown = 16;

        public bool Visible = true;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Bootstrap()
        {
            if (FindAnyObjectByType<LogisticsDebugOverlay>() != null) return;
            var go = new GameObject("LogisticsDebugOverlay");
            go.AddComponent<LogisticsDebugOverlay>();
            DontDestroyOnLoad(go);
        }

        void OnGUI()
        {
            if (!Visible) return;

            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;

            var em = world.EntityManager;
            var query = em.CreateEntityQuery(ComponentType.ReadOnly<LogisticsDBSingleton>());
            if (query.IsEmpty) return;

            var db = query.GetSingleton<LogisticsDBSingleton>();

            var area = new Rect(10, 10, 440, 440);
            GUILayout.BeginArea(area, GUI.skin.box);

            var header = new GUIStyle(GUI.skin.label) { richText = true, fontSize = 13 };
            GUILayout.Label("<b>Logistics Debug Overlay</b>", header);

            var producer = world.GetExistingSystemManaged<SyntheticProducerSystem>();
            if (producer != null)
                producer.Enabled = GUILayout.Toggle(producer.Enabled, "Enable synthetic producer");

            Visible = GUILayout.Toggle(Visible, "Overlay visible");

            int currentKeys   = db.CurrentAmounts.IsCreated ? db.CurrentAmounts.Count()   : 0;
            int reservations  = db.Reservations.IsCreated   ? db.Reservations.Count()    : 0;
            int pendingDeltas = db.PendingDeltas.IsCreated  ? db.PendingDeltas.Count()   : 0;

            GUILayout.Label($"CurrentAmounts keys: {currentKeys}");
            GUILayout.Label($"Reservations  entries: {reservations}");
            GUILayout.Label($"PendingDeltas entries: {pendingDeltas}");

            GUILayout.Space(6);
            GUILayout.Label("Top CurrentAmounts:");

            if (db.CurrentAmounts.IsCreated && currentKeys > 0)
            {
                var pairs = db.CurrentAmounts.GetKeyValueArrays(Allocator.Temp);
                int shown = 0;
                for (int i = 0; i < pairs.Length && shown < MaxEntriesShown; i++, shown++)
                    GUILayout.Label($"  Bank#{pairs.Keys[i].Bank.Index}  Item#{pairs.Keys[i].ItemId}  =  {pairs.Values[i]}");
                pairs.Dispose();
            }

            GUILayout.EndArea();
        }
    }
}
