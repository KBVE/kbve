using System;
using System.Threading;
using System.Threading.Tasks;
using Cysharp.Threading.Tasks;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using R3;
using Supabase.Gotrue;
using Supabase.Gotrue.Interfaces;
using Newtonsoft.Json;

namespace KBVE.SSDB.SupabaseFDW
{
    public class UnitySession : IGotrueSessionPersistence<Session>
    {
        private const string PlayerPrefsKey = "SupabaseSession";

        public void SaveSession(Session session)
        {
            if (session != null)
            {
                string json = JsonConvert.SerializeObject(session);
                PlayerPrefs.SetString(PlayerPrefsKey, json);
                PlayerPrefs.Save();
                Debug.Log("Session saved to PlayerPrefs");
            }
        }

        public Session LoadSession()
        {
            if (PlayerPrefs.HasKey(PlayerPrefsKey))
            {
                string json = PlayerPrefs.GetString(PlayerPrefsKey);
                if (!string.IsNullOrEmpty(json))
                {
                    try
                    {
                        var session = JsonConvert.DeserializeObject<Session>(json);
                        Debug.Log("Session loaded from PlayerPrefs");
                        return session;
                    }
                    catch (Exception e)
                    {
                        Debug.LogError($"Failed to deserialize session: {e.Message}");
                        return null;
                    }
                }
            }
            Debug.Log("No saved session found");
            return null;
        }

        public void DestroySession()
        {
            if (PlayerPrefs.HasKey(PlayerPrefsKey))
            {
                PlayerPrefs.DeleteKey(PlayerPrefsKey);
                PlayerPrefs.Save();
                Debug.Log("Session removed from PlayerPrefs");
            }
        }
    }
}