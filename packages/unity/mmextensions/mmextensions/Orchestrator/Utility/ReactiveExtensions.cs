using R3;
using Cysharp.Threading.Tasks;
using System;
using System.Threading;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public static class ReactiveExtensions
    {
        public static UniTask WaitUntilTrue(this ReactiveProperty<bool> property, CancellationToken cancellationToken = default)
        {
            if (property.Value)
                return UniTask.CompletedTask;

            var tcs = new UniTaskCompletionSource();

            IDisposable subscription = null;
            subscription = property.Subscribe(value =>
            {
                if (value)
                {
                    subscription.Dispose();
                    tcs.TrySetResult();
                }
            });

            cancellationToken.Register(() =>
            {
                subscription.Dispose();
                tcs.TrySetCanceled();
            });

            return tcs.Task;
        }
    }
}
