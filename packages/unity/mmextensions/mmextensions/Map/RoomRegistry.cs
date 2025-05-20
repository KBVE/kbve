using System.Collections.Generic;
using UnityEngine;

namespace KBVE.MMExtensions.Map
{
[CreateAssetMenu(menuName = "KBVE/Dungeon/Room Registry")]
public class RoomRegistry : ScriptableObject
{
    [System.Serializable]
    public class Entry
    {
        public RoomType type;
        public string addressKey;
    }

    public List<Entry> entries;

    /// <summary>
    /// Returns the Addressables key for the given RoomType
    /// </summary>
    public string GetAddress(RoomType type)
    {
        var entry = entries.Find(e => e.type == type);
        if (entry == null || string.IsNullOrWhiteSpace(entry.addressKey))
        {
            Debug.LogError($"[RoomRegistry] No address found for RoomType: {type}");
            return null;
        }

        return entry.addressKey;
    }
}
}