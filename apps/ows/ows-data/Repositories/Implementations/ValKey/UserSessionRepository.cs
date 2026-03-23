using System;
using System.Text.Json;
using System.Threading.Tasks;
using OWSData.Models.StoredProcs;
using OWSData.Repositories.Interfaces;
using StackExchange.Redis;

namespace OWSData.Repositories.Implementations.ValKey
{
    public class UserSessionRepository : IUserSessionRepository
    {
        private static readonly Lazy<ConnectionMultiplexer> Connection =
            new(() => ConnectionMultiplexer.Connect(GetConnectionString()));

        private static IDatabase Database => Connection.Value.GetDatabase();
        private static string keyPrefix = "user:session:";

        private static string GetConnectionString()
        {
            var host = Environment.GetEnvironmentVariable("UserSessionCacheOptions__HostName") ?? "localhost";
            var port = Environment.GetEnvironmentVariable("UserSessionCacheOptions__Port") ?? "6379";
            var password = Environment.GetEnvironmentVariable("UserSessionCacheOptions__Password");

            var connStr = $"{host}:{port}";
            if (!string.IsNullOrEmpty(password))
            {
                connStr += $",password={password}";
            }
            return connStr;
        }

        private string constructUserSessionKeyFromUserGuid(Guid UserGuid)
        {
            return $"{keyPrefix}{UserGuid.ToString()}";
        }

        public async Task<GetUserSession> GetUserSession(Guid UserGuid)
        {
            string key = constructUserSessionKeyFromUserGuid(UserGuid);
            ValidateKey(key);

            RedisValue userSessionJson = await Database.StringGetAsync(key);
            if (userSessionJson.IsNullOrEmpty)
            {
                return new GetUserSession();
            }

            try
            {
                var userSession = JsonSerializer.Deserialize<GetUserSession>(userSessionJson!);
                return userSession ?? new GetUserSession();
            }
            catch (JsonException)
            {
                return new GetUserSession();
            }
        }

        public async Task SetUserSession(Guid UserGuid, GetUserSession userSession)
        {
            string key = constructUserSessionKeyFromUserGuid(UserGuid);
            ValidateKey(key);

            if (userSession == null)
            {
                throw new ArgumentNullException(nameof(userSession));
            }

            string userSessionJson = JsonSerializer.Serialize(userSession);
            await Database.StringSetAsync(key, userSessionJson);
        }

        private static void ValidateKey(string key)
        {
            if (string.IsNullOrWhiteSpace(key))
            {
                throw new ArgumentException("A non-empty session key is required.", nameof(key));
            }
        }
    }
}
