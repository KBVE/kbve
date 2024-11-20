using UnityEngine;

namespace KBVE.Kilonet.Objects
{
    public class KilonetObject : MonoBehaviour
    {
        [HideInInspector]
        public byte[] ULID { get; private set; }

        private void Awake()
        {
            if (ULID == null || ULID.Length == 0)
            {
                ULID = ULIDHelper.GenerateBinaryULID();
            }

            KilonetManager.Instance.Register(this);
        }
        private void OnDestroy()
        {
            KilonetManager.Instance.Unregister(this);
        }

        public string GetULIDAsString()
        {
            return ULIDHelper.ToBase32(ULID);
        }
    }
}
