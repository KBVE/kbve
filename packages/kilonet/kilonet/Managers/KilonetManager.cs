using UnityEngine;
using System.Collections.Generic;
using Cysharp.Threading.Tasks;
using KBVE.Kilonet.Objects;

namespace KBVE.Kilonet.Managers
{
    public class KilonetManager : MonoBehaviour
    {
        public static KilonetManager Instance { get; private set; }

    }
}