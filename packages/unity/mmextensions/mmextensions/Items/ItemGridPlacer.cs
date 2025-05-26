using UnityEngine;
using MoreMountains.TopDownEngine;
using MoreMountains.Tools;
using System;

namespace KBVE.MMExtensions.Items
{
    /// <summary>
    /// Handles the preview and placement logic of grid-based deployables.
    /// </summary>
    public class ItemGridPlacer : MonoBehaviour, MMEventListener<TopDownEngineEvent>
    {

        [Header("Placement Settings")]
        [SerializeField] private GameObject prefabToSpawn;
        [SerializeField] private Color validPlacementTint;
        [SerializeField] private Color invalidPlacementTint;
        [SerializeField] private float placementRadius = 5f;
        [SerializeField] private LayerMask ObstacleLayer;

        private GameObject preview;
        private SpriteRenderer previewSpriteRenderer;
        private Transform characterTransform;
        private Color validPlacementColor;
        private Color invalidPlacementColor;
        private Vector3 lastGridPos;
        private Vector2 checkBox = Vector2.one * 0.5f;
        private SpriteRenderer prefabSpriteRenderer;
        private bool isDebug;

        /// <summary>
        /// Begin placement preview with specified prefab and parameters.
        /// </summary>
        public void StartSelection(GameObject prefabToSpawn, SpriteRenderer prefabSpriteRenderer, LayerMask obstacleLayer, Transform characterTransform)
        {
            this.prefabToSpawn = prefabToSpawn;
            this.prefabSpriteRenderer = prefabSpriteRenderer;
            ObstacleLayer = obstacleLayer;
            this.characterTransform = characterTransform;

            InitializePreview();
        }


        private void InitializePreview()
        {

            preview = new GameObject("preview");
            previewSpriteRenderer = preview.AddComponent<SpriteRenderer>();
            previewSpriteRenderer.sprite = prefabSpriteRenderer.sprite;
            previewSpriteRenderer.sortingLayerName = prefabSpriteRenderer.sortingLayerName;
            validPlacementColor = prefabSpriteRenderer.color * validPlacementTint;
            invalidPlacementColor = prefabSpriteRenderer.color * invalidPlacementTint;
        }

        private bool DrawPreview(out Vector3 gridPos)
        {
            gridPos = Vector3.zero;
            if(!characterTransform || !prefabSpriteRenderer) return false;
            Vector3 mouseWorldPos = Camera.main.ScreenToWorldPoint(Input.mousePosition);
            GridManager gridManager = MoreMountains.Tools.MMSingleton<GridManager>.TryGetInstance();
            gridPos = gridManager.WorldToCellCoordinates(mouseWorldPos);
            gridPos.z = 0;
            preview.transform.position = gridPos;
            bool isPosValid = Vector3.Distance(characterTransform.transform.position, gridPos) < placementRadius && PhysicsPositionValid(gridPos);
            previewSpriteRenderer.color = isPosValid ? validPlacementColor : invalidPlacementColor;
            lastGridPos = gridPos;
            return isPosValid;
        }

        private bool PhysicsPositionValid(Vector3 checkPos)
            {
            return Physics2D.OverlapBoxAll(
                checkPos,
                checkBox,
                0f,
                ObstacleLayer
                ).Length == 0 &&
                Physics2D.Raycast(characterTransform.transform.position, checkPos - characterTransform.transform.position, (checkPos - characterTransform.transform.position).magnitude, ObstacleLayer).collider == null;
            }
            
        private void Spawn(Vector3 pos)
        {
        Instantiate(prefabToSpawn, pos, Quaternion.identity);
        }

        private void Update()
        {
            if(DrawPreview(out Vector3 gridPos) && Input.GetMouseButtonDown(1))
            {
                Spawn(gridPos);
                prefabSpriteRenderer = null;
                Destroy(preview);
            }
        }

        private void OnEnable()
        {
        this.MMEventStartListening();
        }

        private void OnDisable()
        {
        this.MMEventStopListening();
        }

        public void OnMMEvent(TopDownEngineEvent eventType)
        {
            if(eventType.EventType == TopDownEngineEventTypes.SpawnComplete)
            {
                characterTransform = LevelManager.Current.Players[0].transform;
            }
        }

        private void OnDrawGizmos()
        {
            if(!isDebug || !Application.isPlaying) return;
            Gizmos.DrawWireSphere(characterTransform.transform.position, placementRadius);
            Gizmos.DrawWireCube(lastGridPos, checkBox);
        }

    }

}