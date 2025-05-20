using System.Collections.Generic;
using UnityEngine;
using MoreMountains.TopDownEngine;
using MoreMountains.Tools;

namespace KBVE.MMExtensions.Map
{
    public class RoomChunkManager : MonoBehaviour, MMEventListener<TopDownEngineEvent>
    {
        [Header("Player")]
        [Tooltip("Auto-assigned after player[0] spawn via TopDownEngineEvent (SpawnComplete). Leave empty unless manually overriding.")]
        public Transform player;

        [Header("Chunk Settings")]
        public float visibleRadius = 30f;

        private readonly List<RoomBase> trackedRooms = new();

        public void RegisterRoom(RoomBase room)
        {
            if (!trackedRooms.Contains(room))
                trackedRooms.Add(room);
        }


        public void OnMMEvent(TopDownEngineEvent engineEvent)
        {
            if (engineEvent.EventType == TopDownEngineEventTypes.SpawnComplete && player == null)
            {
                var playerGO = GameObject.FindGameObjectWithTag("Player");
                if (playerGO != null)
                {
                    player = playerGO.transform;
                    Debug.Log("[RoomChunkManager] Player linked from MM spawn event.");
                }
            }
        }

        private void OnEnable()
        {
            this.MMEventStartListening<TopDownEngineEvent>();
        }

        private void OnDisable()
        {
            this.MMEventStopListening<TopDownEngineEvent>();
        }

        private void Update()
        {
            if (player == null) return;

            Vector3 playerPos = player.position;

            foreach (var room in trackedRooms)
            {
                float dist = Vector3.Distance(playerPos, room.transform.position);
                bool shouldBeActive = dist <= visibleRadius;

                if (room.gameObject.activeSelf != shouldBeActive)
                    room.gameObject.SetActive(shouldBeActive);
            }
        }
    }

}