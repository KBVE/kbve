using UnityEngine;
using Cysharp.Threading.Tasks;

namespace KBVE.MMExtensions.Map
{
    public interface IRoomFactory
    {
        UniTask<RoomBase> SpawnAsync(Vector3 position, RoomType type);
    }
}