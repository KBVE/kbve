using UnityEngine;

namespace KBVE.Kilonet.Objects
{
    public class KilonetObject : MonoBehaviour
    {
        [HideInInspector]
        public string ULID { get; private set; }

        private void Awake()
        {
            if (string.IsNullOrEmpty(ULID))
            {
                ULID = ULIDHelper.GenerateULID();
            }

            KilonetManager.Instance.Register(this);
        }

        private void OnDestroy()
        {
            KilonetManager.Instance.Unregister(this);
        }
    }
}
