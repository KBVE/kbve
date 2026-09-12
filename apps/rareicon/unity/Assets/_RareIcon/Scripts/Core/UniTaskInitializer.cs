using UnityEngine;
using UnityEngine.LowLevel;
using Cysharp.Threading.Tasks;

public static class UniTaskInitializer
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void InitializeUniTaskPlayerLoop()
    {
        var playerLoop = PlayerLoop.GetCurrentPlayerLoop();
        PlayerLoopHelper.Initialize(ref playerLoop);
    }
}
