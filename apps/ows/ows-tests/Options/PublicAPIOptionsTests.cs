using OWSShared.Options;
using Xunit;

namespace OWSTests.Options
{
    public class PublicAPIOptionsTests
    {
        [Fact]
        public void SectionName_Is_Correct()
        {
            Assert.Equal("OWSPublicAPIConfig", PublicAPIOptions.SectionName);
        }

        [Fact]
        public void Can_Set_Timing_Options()
        {
            var opts = new PublicAPIOptions
            {
                SecondsToWaitForServerSpinUp = 180,
                SecondsToWaitInBetweenSpinUpPolling = 3,
                SecondsToWaitBeforeFirstPollForSpinUp = 5,
                OWSInstanceMangementBaseAddress = "http://instancemgmt:80"
            };

            Assert.Equal(180, opts.SecondsToWaitForServerSpinUp);
            Assert.Equal(3, opts.SecondsToWaitInBetweenSpinUpPolling);
            Assert.Equal(5, opts.SecondsToWaitBeforeFirstPollForSpinUp);
            Assert.Equal("http://instancemgmt:80", opts.OWSInstanceMangementBaseAddress);
        }

        [Fact]
        public void Default_Timing_Values_Are_Zero()
        {
            var opts = new PublicAPIOptions();
            Assert.Equal(0, opts.SecondsToWaitForServerSpinUp);
            Assert.Equal(0, opts.SecondsToWaitInBetweenSpinUpPolling);
            Assert.Equal(0, opts.SecondsToWaitBeforeFirstPollForSpinUp);
        }
    }
}
