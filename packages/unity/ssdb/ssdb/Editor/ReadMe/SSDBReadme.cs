using System;
using UnityEngine;

namespace KBVE.SSDB.Editor
{
    [CreateAssetMenu(fileName = "SSDBReadme", menuName = "SSDB/Readme", order = 1)]
    public class SSDBReadme : ScriptableObject
    {
        public Texture2D icon;
        public string title = "SSDB - Server Side Database Bridge";
        public Section[] sections;

        [Serializable]
        public class Section
        {
            public string heading;
            [TextArea(3, 10)]
            public string text;
            public string linkText;
            public string url;
            public bool expandable = false;
            public bool expanded = true;
        }
    }
}