using OWSShared.Options;
using Xunit;

namespace OWSTests.Options
{
    public class RabbitMQOptionsTests
    {
        [Fact]
        public void SectionName_Is_Correct()
        {
            Assert.Equal("RabbitMQOptions", RabbitMQOptions.SectionName);
        }

        [Fact]
        public void Can_Set_All_Properties()
        {
            var opts = new RabbitMQOptions
            {
                RabbitMQHostName = "rabbitmq.svc.cluster.local",
                RabbitMQPort = 5672,
                RabbitMQUserName = "guest",
                RabbitMQPassword = "guest"
            };

            Assert.Equal("rabbitmq.svc.cluster.local", opts.RabbitMQHostName);
            Assert.Equal(5672, opts.RabbitMQPort);
            Assert.Equal("guest", opts.RabbitMQUserName);
            Assert.Equal("guest", opts.RabbitMQPassword);
        }

        [Fact]
        public void Default_Port_Is_Zero()
        {
            var opts = new RabbitMQOptions();
            Assert.Equal(0, opts.RabbitMQPort);
        }

        [Fact]
        public void Default_Strings_Are_Null()
        {
            var opts = new RabbitMQOptions();
            Assert.Null(opts.RabbitMQHostName);
            Assert.Null(opts.RabbitMQUserName);
            Assert.Null(opts.RabbitMQPassword);
        }
    }
}
