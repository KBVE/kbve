using System;

namespace KBVE.SSDB
{
    public class AchievementInfo
    {
        public string ApiName { get; set; }
        public string DisplayName { get; set; }
        public bool IsAchieved { get; set; }
        public DateTime UnlockTime { get; set; }
    }
}