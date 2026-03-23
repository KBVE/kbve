using OWSData.SQL;
using Xunit;

namespace OWSTests.Data
{
    public class GenericQueriesTests
    {
        [Fact]
        public void PlayerLoginAndCreateSession_Uses_Crypt()
        {
            Assert.Contains("crypt(@Password", GenericQueries.PlayerLoginAndCreateSession);
        }

        [Fact]
        public void PlayerLoginAndCreateSession_Returns_Authenticated_And_SessionGUID()
        {
            Assert.Contains("Authenticated", GenericQueries.PlayerLoginAndCreateSession);
            Assert.Contains("UserSessionGUID", GenericQueries.PlayerLoginAndCreateSession);
        }

        [Fact]
        public void PlayerLoginAndCreateSession_Supports_DontCheckPassword()
        {
            Assert.Contains("@DontCheckPassword", GenericQueries.PlayerLoginAndCreateSession);
        }

        [Fact]
        public void AddUser_Uses_Bcrypt_Salt()
        {
            Assert.Contains("gen_salt('bf'", GenericQueries.AddUser);
        }

        [Fact]
        public void AddUser_Hashes_Password()
        {
            Assert.Contains("crypt(@Password", GenericQueries.AddUser);
            Assert.Contains("PasswordHash", GenericQueries.AddUser);
        }

        [Fact]
        public void AddUser_Requires_All_Fields()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.AddUser);
            Assert.Contains("@Email", GenericQueries.AddUser);
            Assert.Contains("@Password", GenericQueries.AddUser);
            Assert.Contains("@FirstName", GenericQueries.AddUser);
            Assert.Contains("@LastName", GenericQueries.AddUser);
            Assert.Contains("@Role", GenericQueries.AddUser);
        }

        [Fact]
        public void GetAllCharacters_Requires_Session()
        {
            Assert.Contains("@CustomerGUID", GenericQueries.GetAllCharacters);
            Assert.Contains("@UserSessionGUID", GenericQueries.GetAllCharacters);
        }

        [Fact]
        public void CreateCharacter_Requires_ClassName()
        {
            Assert.Contains("@CharacterName", GenericQueries.CreateCharacterSQL);
            Assert.Contains("@ClassName", GenericQueries.CreateCharacterSQL);
        }

        [Fact]
        public void RemoveCharacter_Cascades_Ability_Deletes()
        {
            Assert.Contains("del_char_ability_bar_abilities", GenericQueries.RemoveCharacter);
            Assert.Contains("del_char_ability_bars", GenericQueries.RemoveCharacter);
            Assert.Contains("del_char_has_abilities", GenericQueries.RemoveCharacter);
        }

        [Fact]
        public void RemoveCharacter_Validates_Session()
        {
            Assert.Contains("@UserSessionGUID", GenericQueries.RemoveCharacter);
        }

        [Fact]
        public void Logout_Cleans_Up_Session()
        {
            Assert.Contains("DELETE", GenericQueries.Logout.ToUpper());
            Assert.Contains("UserSessions", GenericQueries.Logout);
        }

        [Fact]
        public void UpdateUser_Does_Not_Allow_Password_Change()
        {
            Assert.DoesNotContain("Password", GenericQueries.UpdateUser);
        }

        [Fact]
        public void Queries_Do_Not_Contain_Hardcoded_GUIDs()
        {
            var queries = new[]
            {
                GenericQueries.PlayerLoginAndCreateSession,
                GenericQueries.AddUser,
                GenericQueries.GetAllCharacters,
                GenericQueries.Logout,
                GenericQueries.UpdateUser,
                GenericQueries.RemoveCharacter
            };

            foreach (var query in queries)
            {
                Assert.DoesNotMatch(@"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", query);
            }
        }

        [Fact]
        public void Queries_Use_Parameterized_Inputs()
        {
            // No string concatenation — all user input must be via @Parameters
            Assert.DoesNotContain("' +", GenericQueries.PlayerLoginAndCreateSession);
            Assert.DoesNotContain("' +", GenericQueries.AddUser);
            Assert.DoesNotContain("\" +", GenericQueries.PlayerLoginAndCreateSession);
        }
    }
}
