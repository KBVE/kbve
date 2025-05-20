using System.Collections.Generic;
using Cysharp.Threading.Tasks;
using UnityEngine;
using VContainer;

namespace KBVE.MMExtensions.Map
{
public class DungeonBootstrapper : MonoBehaviour
{
    [Header("Debug")]
    public bool debug = true;

    [Inject]
    private RoomGraphManager graphManager;

    private void Log(string msg)
    {
        if (debug)
            Debug.Log($"[DungeonBootstrapper] {msg}");
    }

    private async void Start()
    {
        await UniTask.DelayFrame(1);
        var anchors = new List<RoomAnchor>(FindObjectsOfType<RoomAnchor>());
        Log($"Found {anchors.Count} RoomAnchors");

        if (anchors.Count == 0)
        {
            Log("No RoomAnchors found. Aborting.");
            return;
        }

        if (graphManager == null)
        {
            Log("GraphManager is null. Injection failed?");
            return;
        }

        try
        {
            await graphManager.ExpandFromAnchors(anchors);
        }
        catch (System.Exception ex)
        {
            Log($"ExpandFromAnchors threw: {ex}");
        }
    }
}

}