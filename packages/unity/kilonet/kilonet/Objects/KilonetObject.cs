using UnityEngine;
using KBVE.Kilonet.Managers;
using KBVE.Kilonet.Utils;

namespace KBVE.Kilonet.Objects
{
    public class KilonetObject : MonoBehaviour
    {
        [HideInInspector]
        public byte[] ULID { get; set; }

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
