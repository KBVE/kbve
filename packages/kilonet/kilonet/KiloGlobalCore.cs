using UnityEngine;

namespace KBVE.Kilonet
{
    public class KiloGlobalCore : MonoBehaviour
    {
        private static KiloGlobalCore _instance;

        public static KiloGlobalCore Instance
        {
            get
            {
                if (_instance == null)
                {
                    _instance = Object.FindObjectsByType<KiloGlobalCore>(FindObjectsSortMode.None)[0];

                    if (_instance == null)
                    {
                        GameObject coreObject = new GameObject(nameof(KiloGlobalCore));
                        _instance = coreObject.AddComponent<KiloGlobalCore>();
                        DontDestroyOnLoad(coreObject);
                    }
                }
                return _instance;
            }
        }

        public GameManager Manager { get; private set; }

        private void Awake()
        {
            if (_instance == null)
            {
                _instance = this;
                DontDestroyOnLoad(gameObject);
                InitializeKiloGlobalCore();
            }
            else if (_instance != this)
            {
                Destroy(gameObject);
            }
        }

        private void InitializeKiloGlobalCore()
        {
            Debug.Log("KiloGlobalCore is initialized!");

            if (Manager == null)
            {
                Manager = GameManager.Instance;
                // No need to call InitializeKiloManager as GameManager handles its own initialization in Awake
            }
        }
    }
}
