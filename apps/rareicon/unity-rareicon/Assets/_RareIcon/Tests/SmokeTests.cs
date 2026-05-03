using NUnit.Framework;

namespace RareIcon.Tests
{
    /// <summary>Sanity baseline so the CI test gate has something to run.</summary>
    public class SmokeTests
    {
        [Test]
        public void Sanity_OnePlusOneEqualsTwo()
        {
            Assert.AreEqual(2, 1 + 1);
        }

        [Test]
        public void Sanity_StringInternalEquality()
        {
            Assert.AreEqual("rareicon", "rareicon");
        }
    }
}
