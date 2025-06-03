using System;

namespace KBVE.MMExtensions.SSDB
{
    public class AchievementInfo
    {
        public string ApiName { get; set; }
        public string DisplayName { get; set; }
        public bool IsAchieved { get; set; }
        public DateTime UnlockTime { get; set; }
    }
}