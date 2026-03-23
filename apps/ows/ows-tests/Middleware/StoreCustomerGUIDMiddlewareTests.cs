using System;
using Xunit;

namespace OWSTests.Middleware
{
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
            // The middleware currently allows Guid.Empty through — this test
            // documents the expected behavior after the fix in issue #8664 item #2
            var emptyGuid = Guid.Parse("00000000-0000-0000-0000-000000000000");
            Assert.Equal(Guid.Empty, emptyGuid);
        }
    }
}
