using OWSShared.Options;
using Xunit;

namespace OWSTests.Options
{
    public class APIPathOptionsTests
    {
        [Fact]
        public void SectionName_Is_Correct()
        {
            Assert.Equal("OWSAPIPathConfig", APIPathOptions.SectionName);
        }

        [Fact]
        public void Can_Set_All_URLs()
        {
            var opts = new APIPathOptions
            {
                InternalPublicApiURL = "http://publicapi:80",
                InternalInstanceManagementApiURL = "http://instancemgmt:80",
                InternalCharacterPersistenceApiURL = "http://charpersist:80"
            };

            Assert.Equal("http://publicapi:80", opts.InternalPublicApiURL);
            Assert.Equal("http://instancemgmt:80", opts.InternalInstanceManagementApiURL);
            Assert.Equal("http://charpersist:80", opts.InternalCharacterPersistenceApiURL);
        }

        [Fact]
        public void Default_Values_Are_Null()
        {
            var opts = new APIPathOptions();
            Assert.Null(opts.InternalPublicApiURL);
            Assert.Null(opts.InternalInstanceManagementApiURL);
            Assert.Null(opts.InternalCharacterPersistenceApiURL);
        }
    }
}
