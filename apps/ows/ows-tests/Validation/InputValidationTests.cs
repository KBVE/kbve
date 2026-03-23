using System;
using OWSShared.Implementations;
using Xunit;

namespace OWSTests.Validation
{
    public class InputValidationTests
    {
        private readonly DefaultPublicAPIInputValidation _validator;

        public InputValidationTests()
        {
            _validator = new DefaultPublicAPIInputValidation();
        }

        // ── ValidateCharacterName ──────────────────────────────────────

        [Theory]
        [InlineData("Hero", "")]
        [InlineData("TestChar", "")]
        [InlineData("Player1", "")]
        [InlineData("ABCD", "")]
        [InlineData("a1b2c3", "")]
        public void ValidateCharacterName_Accepts_Valid_Names(string name, string expected)
        {
            Assert.Equal(expected, _validator.ValidateCharacterName(name));
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("A")]
        [InlineData("AB")]
        [InlineData("ABC")]
        public void ValidateCharacterName_Rejects_Short_Names(string name)
        {
            var result = _validator.ValidateCharacterName(name);
            Assert.NotEmpty(result);
            Assert.Contains("at least 4 characters", result);
        }

        [Theory]
        [InlineData("Hero!")]
        [InlineData("Player Name")]
        [InlineData("test@char")]
        [InlineData("my-char")]
        [InlineData("char.name")]
        public void ValidateCharacterName_Rejects_Special_Characters(string name)
        {
            var result = _validator.ValidateCharacterName(name);
            Assert.NotEmpty(result);
            Assert.Contains("only contains letters and numbers", result);
        }

        [Fact]
        public void ValidateCharacterName_Allows_Underscores()
        {
            // \w matches [a-zA-Z0-9_] so underscores are allowed
            Assert.Equal("", _validator.ValidateCharacterName("Hero_Name"));
        }

        // ── Unimplemented methods ──────────────────────────────────────

        [Fact]
        public void ValidateEmail_Throws_NotImplemented()
        {
            Assert.Throws<NotImplementedException>(() => _validator.ValidateEmail("test@example.com"));
        }

        [Fact]
        public void ValidatePassword_Throws_NotImplemented()
        {
            Assert.Throws<NotImplementedException>(() => _validator.ValidatePassword("password123"));
        }

        [Fact]
        public void ValidateFirstName_Throws_NotImplemented()
        {
            Assert.Throws<NotImplementedException>(() => _validator.ValidateFirstName("John"));
        }

        [Fact]
        public void ValidateLastName_Throws_NotImplemented()
        {
            Assert.Throws<NotImplementedException>(() => _validator.ValidateLastName("Doe"));
        }
    }
}
