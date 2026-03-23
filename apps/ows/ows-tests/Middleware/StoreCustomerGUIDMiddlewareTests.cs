using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using OWSShared.Implementations;
using OWSShared.Middleware;
using Xunit;

namespace OWSTests.Middleware
{
    public class StoreCustomerGUIDMiddlewareTests
    {
        private readonly HeaderCustomerGUID _headerGuid;
        private readonly StoreCustomerGUIDMiddleware _middleware;

        public StoreCustomerGUIDMiddlewareTests()
        {
            _headerGuid = new HeaderCustomerGUID();
            _middleware = new StoreCustomerGUIDMiddleware(_headerGuid);
        }

        private static DefaultHttpContext CreateContext(string path, string guidHeader = null)
        {
            var ctx = new DefaultHttpContext();
            ctx.Request.Path = path;
            if (guidHeader != null)
                ctx.Request.Headers["X-CustomerGUID"] = guidHeader;
            return ctx;
        }

        [Fact]
        public async Task Health_Endpoint_Bypasses_Auth()
        {
            var ctx = CreateContext("/health");
            bool nextCalled = false;

            await _middleware.InvokeAsync(ctx, _ => { nextCalled = true; return Task.CompletedTask; });

            Assert.True(nextCalled);
            Assert.Equal(200, ctx.Response.StatusCode);
        }

        [Fact]
        public async Task Missing_Header_Returns_401()
        {
            var ctx = CreateContext("/api/users");
            bool nextCalled = false;

            await _middleware.InvokeAsync(ctx, _ => { nextCalled = true; return Task.CompletedTask; });

            Assert.False(nextCalled);
            Assert.Equal(401, ctx.Response.StatusCode);
        }

        [Fact]
        public async Task Empty_String_Header_Returns_401()
        {
            var ctx = CreateContext("/api/users", "");
            bool nextCalled = false;

            await _middleware.InvokeAsync(ctx, _ => { nextCalled = true; return Task.CompletedTask; });

            Assert.False(nextCalled);
            Assert.Equal(401, ctx.Response.StatusCode);
        }

        [Fact]
        public async Task Invalid_GUID_Format_Returns_401()
        {
            var ctx = CreateContext("/api/users", "not-a-guid");
            bool nextCalled = false;

            await _middleware.InvokeAsync(ctx, _ => { nextCalled = true; return Task.CompletedTask; });

            Assert.False(nextCalled);
            Assert.Equal(401, ctx.Response.StatusCode);
        }

        [Fact]
        public async Task Empty_GUID_Returns_401()
        {
            var ctx = CreateContext("/api/users", "00000000-0000-0000-0000-000000000000");
            bool nextCalled = false;

            await _middleware.InvokeAsync(ctx, _ => { nextCalled = true; return Task.CompletedTask; });

            Assert.False(nextCalled);
            Assert.Equal(401, ctx.Response.StatusCode);
        }

        [Fact]
        public async Task Valid_GUID_Sets_CustomerGUID_And_Calls_Next()
        {
            var guid = "be92671d-af96-4a6b-bdf7-6a3b6270dae6";
            var ctx = CreateContext("/api/users", guid);
            bool nextCalled = false;

            await _middleware.InvokeAsync(ctx, _ => { nextCalled = true; return Task.CompletedTask; });

            Assert.True(nextCalled);
            Assert.Equal(Guid.Parse(guid), _headerGuid.CustomerGUID);
        }

        [Fact]
        public async Task Valid_GUID_Uppercase_Works()
        {
            var guid = "BE92671D-AF96-4A6B-BDF7-6A3B6270DAE6";
            var ctx = CreateContext("/api/users", guid);
            bool nextCalled = false;

            await _middleware.InvokeAsync(ctx, _ => { nextCalled = true; return Task.CompletedTask; });

            Assert.True(nextCalled);
            Assert.Equal(Guid.Parse(guid), _headerGuid.CustomerGUID);
        }

        [Fact]
        public async Task Header_Name_Is_Case_Insensitive()
        {
            var guid = "be92671d-af96-4a6b-bdf7-6a3b6270dae6";
            var ctx = CreateContext("/api/users");
            ctx.Request.Headers["x-customerguid"] = guid;
            bool nextCalled = false;

            await _middleware.InvokeAsync(ctx, _ => { nextCalled = true; return Task.CompletedTask; });

            Assert.True(nextCalled);
            Assert.Equal(Guid.Parse(guid), _headerGuid.CustomerGUID);
        }
    }

    public class CustomerGUIDValidationTests
    {
        [Theory]
        [InlineData("be92671d-af96-4a6b-bdf7-6a3b6270dae6", true)]
        [InlineData("00000000-0000-0000-0000-000000000000", false)]
        [InlineData("not-a-guid", false)]
        [InlineData("", false)]
        [InlineData(null, false)]
        [InlineData("be92671d-af96-4a6b-bdf7", false)]
        [InlineData("BE92671D-AF96-4A6B-BDF7-6A3B6270DAE6", true)]
        public void CustomerGUID_TryParse_Validation(string input, bool expectedValid)
        {
            bool isValid = Guid.TryParse(input, out Guid result) && result != Guid.Empty;
            Assert.Equal(expectedValid, isValid);
        }

        [Fact]
        public void Empty_GUID_Should_Be_Rejected()
        {
            var emptyGuid = Guid.Parse("00000000-0000-0000-0000-000000000000");
            Assert.Equal(Guid.Empty, emptyGuid);
        }
    }
}
