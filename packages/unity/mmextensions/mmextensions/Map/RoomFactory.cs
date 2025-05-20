using Cysharp.Threading.Tasks;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
using VContainer;
namespace KBVE.MMExtensions.Map
{
    public class RoomFactory : IRoomFactory
    {
        private readonly RoomRegistry _registry;
        private readonly IObjectResolver _resolver;

        private readonly Transform _gridTransform;

        public RoomFactory(RoomRegistry registry, IObjectResolver resolver, Transform gridTransform)
        {
            _registry = registry;
            _resolver = resolver;
            _gridTransform = gridTransform;
        }

        public RoomBase Spawn(Vector3 position, RoomType type)
        {
            Debug.LogError("RoomFactory: Spawn() called on addressables-only factory. Use SpawnAsync() instead.");
            return null;
        }

        public async UniTask<RoomBase> SpawnAsync(Vector3 position, RoomType type)
        {
            string address = _registry.GetAddress(type);
            if (string.IsNullOrEmpty(address))
            {
                Debug.LogError($"[RoomFactory] Invalid address for RoomType: {type}");
                return null;
            }

            var handle = Addressables.LoadAssetAsync<GameObject>(address);
            await handle.ToUniTask();

            GameObject roomObj = Object.Instantiate(handle.Result, position, Quaternion.identity, _gridTransform);
            // GameObject roomObj = Object.Instantiate(handle.Result, position, Quaternion.identity);
            // roomObj.transform.SetParent(_gridTransform, true);

            RoomBase room = roomObj.GetComponent<RoomBase>();

            foreach (var tilemap in roomObj.GetComponentsInChildren<UnityEngine.Tilemaps.Tilemap>())
            {
                tilemap.RefreshAllTiles();
            }

            return room;
        }

    }

}