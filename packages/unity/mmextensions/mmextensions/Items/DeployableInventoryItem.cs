using UnityEngine;
using System;
using MoreMountains.Tools;
using MoreMountains.Feedbacks;
using MoreMountains.InventoryEngine;
using MoreMountains.TopDownEngine;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif
using KBVE.Kilonet.Networks;


namespace KBVE.MMExtensions.Items
{
    [CreateAssetMenu(fileName = "DeployableInventoryItem", menuName = "KBVE/Inventory/Deployable", order = 69)]
    public class DeployableInventoryItem : InventoryItem
    {
        #if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void unityBridge(string json);
        #endif

        [Serializable]
        public class JavaScriptMessage
        {
            public string type;
            public string status;
            public string prefab;
        }

        [Tooltip("The object to spawn when using this item (e.g. a sandbag)")]
        public GameObject DeployablePrefab;

        [Tooltip("The sprite renderer to copy from when displaying a preview of the object to place")]
        public SpriteRenderer BlueprintSpriteRenderer;

        [Tooltip("Layers considered obstacles (walls, other objects, tilemap colliders)")]
        public LayerMask ObstacleLayer;

        [Tooltip("Spawn offset settings, including random spread or alignment")]
        public MMSpawnAroundProperties SpawnProperties;

        [Tooltip("Play a feedback if placement is blocked.")]
        public MMFeedbacks PlacementBlockedFeedback;

        [Header("Obstacle Avoidance")]
        public bool AvoidObstacles = true;
        public float AvoidRadius = 0.5f;
        public int MaxAvoidAttempts = 5;
        public bool Use2D = true;
        public bool QuickDrop = false;

        public override bool Use(string playerID)
        {
            Character character = TargetInventory(playerID).Owner.GetComponentInParent<Character>();
            if (character == null || DeployablePrefab == null || !IsUsable)
                return false;

            if (!QuickDrop)
            {
                if (BlueprintSpriteRenderer == null)
                    BlueprintSpriteRenderer = DeployablePrefab.GetComponent<SpriteRenderer>();

                FindObjectOfType<ItemGridPlacer>()?.StartSelection(
                    DeployablePrefab,
                    BlueprintSpriteRenderer,
                    ObstacleLayer,
                    character.transform
                );

                NotifyUnityBridge();
                return true;
            }

            GameObject spawned = GameObject.Instantiate(DeployablePrefab);
            bool placementOK = !AvoidObstacles;
            int attempts = 0;

            while (!placementOK && attempts < MaxAvoidAttempts)
            {
                MMSpawnAround.ApplySpawnAroundProperties(spawned, SpawnProperties, character.transform.position);
                Vector3 checkPos = spawned.transform.position;

                if (Use2D)
                {
                    RaycastHit2D hit = Physics2D.BoxCast(
                        checkPos + Vector3.right * AvoidRadius,
                        Vector2.one * AvoidRadius,
                        0f,
                        Vector2.left,
                        AvoidRadius,
                        ObstacleLayer
                    );
                    placementOK = hit.collider == null;
                }
                else
                {
                    Collider[] hits = Physics.OverlapBox(
                        checkPos,
                        Vector3.one * AvoidRadius,
                        Quaternion.identity,
                        ObstacleLayer
                    );
                    placementOK = hits.Length == 0;
                }

                attempts++;
            }

            if (!placementOK)
            {
                Debug.LogWarning("[DeployableInventoryItem] No valid spawn location found.");
                if (spawned) Destroy(spawned);
                PlacementBlockedFeedback?.PlayFeedbacks();
                return false;
            }

            NotifyUnityBridge();
            spawned.name = DeployablePrefab.name;
            return true;
        }

        private void NotifyUnityBridge()
        {
            var jsMessage = new JavaScriptMessage
            {
                type = "deployable",
                status = "success",
                prefab = DeployablePrefab.name
            };

            var protocol = new JSONProtocol();
            byte[] jsonBytes = protocol.Serialize(jsMessage);
            string json = System.Text.Encoding.UTF8.GetString(jsonBytes);

            #if UNITY_WEBGL && !UNITY_EDITOR
            unityBridge(json);
            #endif

            Debug.Log("[JSON] " + json);
        }
    }
}