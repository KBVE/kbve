using OWSShared.Options;
using Xunit;

namespace OWSTests.Options
{
    public class StorageOptionsTests
    {
        [Fact]
        public void SectionName_Is_Correct()
        {
            Assert.Equal("OWSStorageConfig", StorageOptions.SectionName);
        }

        [Theory]
        [InlineData("postgres")]
        [InlineData("mysql")]
        [InlineData("mssql")]
        public void OWSDBBackend_Accepts_Valid_Backends(string backend)
        {
            var opts = new StorageOptions { OWSDBBackend = backend };
            Assert.Equal(backend, opts.OWSDBBackend);
        }

        [Fact]
        public void OWSDBConnectionString_Can_Be_Set()
        {
            var opts = new StorageOptions
            {
                OWSDBBackend = "postgres",
                OWSDBConnectionString = "Host=localhost;Database=ows;Username=ows;Password=test"
            };
            Assert.Contains("Host=localhost", opts.OWSDBConnectionString);
        }

        [Fact]
        public void Default_Values_Are_Null()
        {
            var opts = new StorageOptions();
            Assert.Null(opts.OWSDBBackend);
            Assert.Null(opts.OWSDBConnectionString);
        }
    }
}
