using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using OWSShared.Interfaces;
using Serilog;

namespace OWSShared.Middleware
{
    public class StoreCustomerGUIDMiddleware : IMiddleware
    {
        private readonly IHeaderCustomerGUID _customerGuid;

        public StoreCustomerGUIDMiddleware(IHeaderCustomerGUID customerGuid)
        {
            _customerGuid = customerGuid;
        }

        public async Task InvokeAsync(HttpContext context, RequestDelegate next)
        {
            // Skip auth for health endpoint
            if (context.Request.Path.StartsWithSegments("/health"))
            {
                await next(context);
                return;
            }

            var headerValue = context.Request.Headers
                .FirstOrDefault(x => string.Equals(x.Key, "X-CustomerGUID", StringComparison.OrdinalIgnoreCase))
                .Value.ToString();

            if (string.IsNullOrEmpty(headerValue))
            {
                Log.Warning("Missing X-CustomerGUID header from {RemoteIp}", context.Connection.RemoteIpAddress);
                context.Response.StatusCode = 401;
                await context.Response.WriteAsync("Unauthorized: missing X-CustomerGUID header");
                return;
            }

            if (!Guid.TryParse(headerValue, out var parsedGuid) || parsedGuid == Guid.Empty)
            {
                Log.Warning("Invalid X-CustomerGUID header value from {RemoteIp}", context.Connection.RemoteIpAddress);
                context.Response.StatusCode = 401;
                await context.Response.WriteAsync("Unauthorized: invalid X-CustomerGUID header");
                return;
            }

            _customerGuid.CustomerGUID = parsedGuid;
            await next(context);
        }
    }
}
