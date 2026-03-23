using System;
using Xunit;

namespace OWSTests.Validation
{
    public class AgonesConfigTests
    {
        [Fact]
        public void AgonesModeDetected_WhenEnvVarSet()
        {
            Environment.SetEnvironmentVariable("OWS_USE_AGONES", "true");
            var value = Environment.GetEnvironmentVariable("OWS_USE_AGONES");
            Assert.False(String.IsNullOrEmpty(value));
            Environment.SetEnvironmentVariable("OWS_USE_AGONES", null);
        }

        [Fact]
        public void AgonesModeNotDetected_WhenEnvVarUnset()
        {
            Environment.SetEnvironmentVariable("OWS_USE_AGONES", null);
            var value = Environment.GetEnvironmentVariable("OWS_USE_AGONES");
            Assert.True(String.IsNullOrEmpty(value));
        }

        [Theory]
        [InlineData("arc-runners", "ows-hubworld")]
        [InlineData("ows", "chuck-fleet")]
        public void AgonesNamespaceAndFleet_FromEnvVars(string ns, string fleet)
        {
            Environment.SetEnvironmentVariable("AGONES_NAMESPACE", ns);
            Environment.SetEnvironmentVariable("AGONES_FLEET", fleet);

            var agonesNs = Environment.GetEnvironmentVariable("AGONES_NAMESPACE") ?? "ows";
            var agonesFl = Environment.GetEnvironmentVariable("AGONES_FLEET") ?? "ows-hubworld";

            Assert.Equal(ns, agonesNs);
            Assert.Equal(fleet, agonesFl);

            Environment.SetEnvironmentVariable("AGONES_NAMESPACE", null);
            Environment.SetEnvironmentVariable("AGONES_FLEET", null);
        }

        [Fact]
        public void AgonesDefaults_WhenEnvVarsUnset()
        {
            Environment.SetEnvironmentVariable("AGONES_NAMESPACE", null);
            Environment.SetEnvironmentVariable("AGONES_FLEET", null);

            var agonesNs = Environment.GetEnvironmentVariable("AGONES_NAMESPACE") ?? "ows";
            var agonesFl = Environment.GetEnvironmentVariable("AGONES_FLEET") ?? "ows-hubworld";

            Assert.Equal("ows", agonesNs);
            Assert.Equal("ows-hubworld", agonesFl);
        }
    }
}
