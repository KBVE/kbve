using UnityEngine;

namespace KBVE.Kilonet
{
    /// <summary>
    /// Global core class that initializes and manages high-level settings.
    /// It also serves as the entry point for the Kilonet system.
    /// </summary>
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

        public KiloManager Manager { get; private set; }

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

        /// <summary>
        /// Initializes the KiloGlobalCore and sets up the KiloManager.
        /// </summary>
        private void InitializeKiloGlobalCore()
        {
            Debug.Log("KiloGlobalCore is initialized!");

            // Create or find the KiloManager instance
            if (Manager == null)
            {
                Manager = KiloManager.Instance;
                Manager.InitializeKiloManager();
            }
        }
    }
}
