using Supabase.Gotrue;
using Supabase.Gotrue.Interfaces;

namespace KBVE.SSDB.SupabaseFDW
{
    public class AuthStateChangedEvent
    {
        public IGotrueClient<Session, User>.AuthState State { get; }
        public Session Session { get; }

        public AuthStateChangedEvent(IGotrueClient<Session, User>.AuthState state, Session session)
        {
            State = state;
            Session = session;
        }
    }
}