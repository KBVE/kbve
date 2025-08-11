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
        ReactiveProperty<bool> Initialized { get; }

        /// <summary>
        /// The active Supabase session for the authenticated user, if any.
        /// </summary>
        ReactiveProperty<Session?> CurrentSession { get; }

        /// <summary>
        /// The current authenticated user's data.
        /// </summary>
        ReactiveProperty<User?> CurrentUser { get; }

        /// <summary>
        /// Whether the Supabase client is online and connected.
        /// </summary>
        ReactiveProperty<bool> Online { get; }

        /// <summary>
        /// Exposes the underlying Supabase client.
        /// </summary>
        Client Client { get; }

        /// <summary>
        /// Emits an event whenever the authentication state changes.
        /// </summary>
        IObservable<AuthStateChangedEvent> AuthStateStream { get; }
    }
}