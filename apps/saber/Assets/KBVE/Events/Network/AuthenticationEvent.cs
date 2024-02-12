using System;

namespace KBVE.Events.Network
{

 public static class AuthenticationEvent
    {
        public static event Action<string> OnLoginSuccess;
        public static event Action<string> OnLoginFailure;

        public static void TriggerLoginSuccess(string jwt)
        {
            OnLoginSuccess?.Invoke(jwt);
        }

        public static void TriggerLoginFailure(string error)
        {
            OnLoginFailure?.Invoke(error);
        }
    }


}
