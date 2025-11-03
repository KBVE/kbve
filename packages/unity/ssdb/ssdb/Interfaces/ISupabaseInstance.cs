using System;
using R3;
using Supabase;
using Supabase.Gotrue;

namespace KBVE.SSDB.SupabaseFDW
{
    public interface ISupabaseInstance : IDisposable
    {
        /// <summary>
        /// Indicates whether the Supabase service has completed initialization.
        /// </summary>
        SynchronizedReactiveProperty<bool> Initialized { get; }

        /// <summary>
        /// The active Supabase session for the authenticated user, if any.
        /// </summary>
        SynchronizedReactiveProperty<Session?> CurrentSession { get; }

        /// <summary>
        /// The current authenticated user's data.
        /// </summary>
        SynchronizedReactiveProperty<User?> CurrentUser { get; }

        /// <summary>
        /// Whether the Supabase client is online and connected.
        /// </summary>
        SynchronizedReactiveProperty<bool> Online { get; }

        /// <summary>
        /// Exposes the underlying Supabase client.
        /// </summary>
        Supabase.Client Client { get; }

        /// <summary>
        /// Emits an event whenever the authentication state changes.
        /// </summary>
        Observable<AuthStateChangedEvent> AuthStateStream { get; }
    }
}