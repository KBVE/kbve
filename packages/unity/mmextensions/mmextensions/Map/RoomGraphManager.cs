using System.Collections.Generic;
using Cysharp.Threading.Tasks;
using UnityEngine;
using VContainer;
namespace KBVE.MMExtensions.Map
{
    public class RoomGraphManager : MonoBehaviour
    {
        [Inject]
        private IRoomFactory _roomFactory;

        private readonly List<RoomBase> _spawnedRooms = new();

        public async UniTask ExpandFromAnchors(List<RoomAnchor> anchors)
        {
            foreach (var anchor in anchors)
            {
                RoomBase room = await _roomFactory.SpawnAsync(anchor.position, RoomType.Standard);

                if (room == null)
                {
                    Debug.LogError($"[RoomGraph] Failed to spawn room at {anchor.position}");
                    continue;
                }

                if (TryAlignRoomToAnchor(room, anchor))
                {
                    _spawnedRooms.Add(room);
                }
                else
                {
                    Debug.LogWarning($"Failed to align room to anchor at {anchor.position}");
                    Destroy(room.gameObject);
                }
            }
        }

        private bool TryAlignRoomToAnchor(RoomBase room, RoomAnchor anchor)
        {
            Vector2Int facing2D = new Vector2Int(anchor.facing.x, anchor.facing.y);

            foreach (var door in room.doorways)
            {
                if (door.direction == -facing2D)
                {
                    Vector3 doorWorldPos = door.transform.position;
                    Vector3 offset = anchor.position - doorWorldPos;

                    room.transform.position += offset;
                    door.isConnected = true;
                    return true;
                }
            }

            return false;
        }
    }
}