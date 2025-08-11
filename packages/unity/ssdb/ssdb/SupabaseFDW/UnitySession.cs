using KBVE.SSDB;
using KBVE.SSDB.SupabaseFDW;
using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using R3;
using Supabase;
using Supabase.Gotrue;
using Supabase.Gotrue.Interfaces;
using Client = Supabase.Client;


namespace KBVE.SSDB.SupabaseFDW
{
    public class UnitySession : IGotrueSessionPersistence<Session>, IAsyncStartable, IDisposable
    {

        private CancellationTokenSource _cts;

        private SupabaseInstance _supabaseInstance;

        private const string PlayerPrefsKey = "SupabaseSession";


        [Inject]
        public void Construct(SupabaseInstance supabaseInstance)
        {
                _supabaseInstance = supabaseInstance;
        }

        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            _cts = new CancellationTokenSource();
            var linkedToken = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token, cancellationToken).Token;

        

        }

        public Task<Session> LoadSession()
        {
            if (PlayerPrefs.HasKey(PlayerPrefsKey))
            {
                string json = PlayerPrefs.GetString(PlayerPrefsKey);
                var session = JsonUtility.FromJson<Session>(json);
                return Task.FromResult(session);
            }

            return Task.FromResult<Session>(null);
        }

        public Task SaveSession(Session session)
        {
            string json = JsonUtility.ToJson(session);
            PlayerPrefs.SetString(PlayerPrefsKey, json);
            PlayerPrefs.Save();
            return Task.CompletedTask;
        }

        public Task DestroySession()
        {
            PlayerPrefs.DeleteKey(PlayerPrefsKey);
            PlayerPrefs.Save();
            return Task.CompletedTask;
        }


        public void Dispose()
        {
            _cts?.Cancel();
            _cts?.Dispose();
            _disposables.Dispose();
        }
    }
}