using Supabase;
using Supabase.Gotrue;
using Supabase.Gotrue.Interfaces;

namespace KBVE.SSDB.SupabaseFDW
{
    public class AuthStateChangedEvent
    {
        public Constants.AuthState State { get; }
        public Session Session { get; }

        public AuthStateChangedEvent(Constants.AuthState state, Session session)
        {
            State = state;
            Session = session;
        }
    }
}