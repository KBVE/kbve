using System;
using System.Net.Http;
using System.Threading.Tasks;
using Supabase.Gotrue;
using UnityEngine;

namespace KBVE.SSDB.SupabaseFDW
{
    public class NetworkStatus
    {
        public Client Client { get; set; }
        private HttpClient _httpClient = new HttpClient();

        public async Task<bool> StartAsync(string url)
        {
            try
            {
                var response = await _httpClient.GetAsync(url);
                return response.IsSuccessStatusCode;
            }
            catch (Exception e)
            {
                Debug.LogError($"Network check failed: {e.Message}");
                return false;
            }
        }
    }
}