using KBVE.SSDB;
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

    public class SupabaseInstance : IAsyncStartable, IDisposable
    {

        private readonly CompositeDisposable _disposables = new();

        // We create an object to monitor the network status.
        NetworkStatus NetworkStatus;

        // Create a Supabase objects object.
        SupabaseOptions options;

        public ReactiveProperty<Supabase.Client?> _supabase { get; } = new(null);

        //Supabase.Client _supabase;


        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            // We create an object to monitor the network status.
            NetworkStatus = new();

            // Create a Supabase objects object.
            options = new();
            // Set the options to auto-refresh the JWT token with a background thread.
            options.AutoRefreshToken = true;

            // Create the client object. Note that the project URL and the anon key are
            // available in the Supabase dashboard. In addition, note that the public anon
            // key is not a security risk - in JavaScript projects, this key is visible
            // in the browser viewing source!
            _supabase = new Client(KBVE.SSDB.Supabaseinfo.Url, KBVE.SSDB.Supabaseinfo.AnonKey, options);
            // "_supabase = new Client("https://project URL", "supabase PUBLIC anon key", options);

            // This adds a listener for debug information, especially useful for dealing
            // with errors from the auto-refresh background thread.
            _supabase.Auth.AddDebugListener(DebugListener);

            // Here we are getting the auth service and passing it to the network status
            // object. The network status object will tell the auth service when the
            // network is up or down.
            NetworkStatus.Client = (Supabase.Gotrue.Client)_supabase.Auth;

            // Here we are setting up the persistence layer. This is an object that implements
            // the IGotrueSessionPersistence<Session> interface. This is used to store the JWT 
            // token so the user won't have to log in every time they start the app.
            _supabase.Auth.SetPersistence(new UnitySession());

            // Here we are setting up the listener for the auth state. This listener will
            // be called in response to the auth state changing. This is where you would
            // update your UI to reflect the current auth state.
            _supabase.Auth.AddStateChangedListener(UnityAuthListener);

            // We now instruct the auth service to load the session from disk using the persistence
            // object we created earlier
            _supabase.Auth.LoadSession();

            // In this case, we are setting up the auth service to allow unconfirmed user sessions.
            // Depending on your use case, you may want to set this to false and require the user
            // to validate their email address before they can log in.
            _supabase.Auth.Options.AllowUnconfirmedUserSessions = true;

            // This is a well-known URL that is used to test network connectivity.
            // We use this to determine if the network is up or down.
            string url =
                $"{SupabaseSettings.SupabaseURL}/auth/v1/settings?apikey={SupabaseSettings.SupabaseAnonKey}";
            try
            {
                // We start the network status object. This will attempt to connect to the
                // well-known URL and determine if the network is up or down.
                _supabase!.Auth.Online = await NetworkStatus.StartAsync(url);
            }
            catch (NotSupportedException)
            {
                // On certain platforms, the NetworkStatus object may not be able to determine
                // the network status. In this case, we just assume the network is up.
                _supabase!.Auth.Online = true;
            }
            catch (Exception e)
            {
                // If there are other kinds of error, we assume the network is down,
                // and in this case we send the error to a UI element to display to the user.
                // This PostMessage method is specific to this application - you will
                // need to adapt this to your own application.
                PostMessage(NotificationType.Debug, $"Network Error {e.GetType()}", e);
                _supabase!.Auth.Online = false;
            }
            if (_supabase.Auth.Online)
            {
                // If the network is up, we initialize the Supabase client.
                await _supabase.InitializeAsync();

                // Here we are fetching the current settings for the auth service as exposed
                // by the server. For example, we might want to know which providers have been
                // configured, or change the behavior if auto-confirm email is turned off or on.
                Settings = await _supabase.Auth.Settings();
            }
        }


        public void Dispose()
        {
            _disposables.Dispose();
        }
    }
}





