using OWSData.SQL;
using Xunit;

namespace OWSTests.Data
{
    public class AdditionalQueryTests
    {
        // ── Abilities ──────────────────────────────────────────────────

        [Fact]
        public void GetAbilities_Requires_CustomerGUID()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.GetAbilities);
        }

        [Fact]
        public void GetCharacterAbilities_Requires_CustomerGUID_And_CharName()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.GetCharacterAbilities);
            Assert.Contains("@CharName", GenericQueries.GetCharacterAbilities);
        }

        [Fact]
        public void GetCharacterAbilityBars_Requires_CustomerGUID()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.GetCharacterAbilityBars);
            Assert.Contains("@CharName", GenericQueries.GetCharacterAbilityBars);
        }

        // ── Characters ─────────────────────────────────────────────────

        [Fact]
        public void GetCharByCharName_Requires_CustomerGUID_And_CharName()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.GetCharByCharName);
            Assert.Contains("@CharName", GenericQueries.GetCharByCharName);
        }

        [Fact]
        public void AddCharacterToInstance_Requires_All_IDs()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.AddCharacterToInstance);
            Assert.Contains("@MapInstanceID", GenericQueries.AddCharacterToInstance);
            Assert.Contains("@CharacterID", GenericQueries.AddCharacterToInstance);
        }

        [Fact]
        public void UpdateCharacterStats_Requires_CustomerGUID()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.UpdateCharacterStats);
        }

        [Fact]
        public void UpdateCharacterPosition_Requires_CustomerGUID()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.UpdateCharacterPosition);
            Assert.Contains("@CharacterID", GenericQueries.UpdateCharacterPosition);
        }

        [Fact]
        public void GetCharacterByName_Requires_CustomerGUID()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.GetCharacterByName);
            Assert.Contains("@CharacterName", GenericQueries.GetCharacterByName);
        }

        // ── Global Data ────────────────────────────────────────────────

        [Fact]
        public void AddGlobalData_Requires_Key_And_Value()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.AddGlobalData);
            Assert.Contains("@GlobalDataKey", GenericQueries.AddGlobalData);
            Assert.Contains("@GlobalDataValue", GenericQueries.AddGlobalData);
        }

        [Fact]
        public void GetGlobalDataByKey_Requires_CustomerGUID()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.GetGlobalDataByGlobalDataKey);
            Assert.Contains("@GlobalDataKey", GenericQueries.GetGlobalDataByGlobalDataKey);
        }

        [Fact]
        public void UpdateGlobalData_Requires_Key_And_Value()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.UpdateGlobalData);
            Assert.Contains("@GlobalDataKey", GenericQueries.UpdateGlobalData);
            Assert.Contains("@GlobalDataValue", GenericQueries.UpdateGlobalData);
        }

        // ── Sessions ───────────────────────────────────────────────────

        [Fact]
        public void GetUserSession_Requires_UserSessionGUID()
        {
            Assert.Contains("@UserSessionGUID", GenericQueries.GetUserSession);
        }

        [Fact]
        public void UserSessionSetSelectedCharacter_Requires_Session_And_Character()
        {
            Assert.Contains("@UserSessionGUID", GenericQueries.UserSessionSetSelectedCharacter);
            Assert.Contains("@SelectedCharacterID", GenericQueries.UserSessionSetSelectedCharacter);
        }

        // ── Map Instances ──────────────────────────────────────────────

        [Fact]
        public void GetMapInstance_Requires_CustomerGUID()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.GetMapInstance);
        }

        [Fact]
        public void UpdateMapInstanceStatus_Requires_CustomerGUID()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.UpdateMapInstanceStatus);
            Assert.Contains("@MapInstanceID", GenericQueries.UpdateMapInstanceStatus);
        }

        [Fact]
        public void GetMapByZoneName_Requires_CustomerGUID()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.GetMapByZoneName);
            Assert.Contains("@ZoneName", GenericQueries.GetMapByZoneName);
        }

        // ── World Servers ──────────────────────────────────────────────

        [Fact]
        public void GetActiveWorldServersByLoad_Requires_CustomerGUID()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.GetActiveWorldServersByLoad);
        }

        [Fact]
        public void UpdateWorldServerStatus_Requires_WorldServerID()
        {
            Assert.Contains("@WorldServerID", GenericQueries.UpdateWorldServerStatus);
            Assert.Contains("@CustomerGUID", GenericQueries.UpdateWorldServerStatus);
        }

        // ── Security: no hardcoded values in additional queries ────────

        [Fact]
        public void Additional_Queries_Do_Not_Contain_Hardcoded_GUIDs()
        {
            var queries = new[]
            {
                GenericQueries.GetAbilities,
                GenericQueries.GetCustomer,
                GenericQueries.AddCharacterToInstance,
                GenericQueries.AddGlobalData,
                GenericQueries.GetGlobalDataByGlobalDataKey,
                GenericQueries.UpdateGlobalData,
                GenericQueries.GetUserSession,
                GenericQueries.GetMapInstance,
                GenericQueries.UpdateMapInstanceStatus,
                GenericQueries.GetActiveWorldServersByLoad,
            };

            foreach (var query in queries)
            {
                Assert.DoesNotMatch(@"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", query);
            }
        }
    }
}
