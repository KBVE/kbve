using NUnit.Framework;

namespace RareIcon.Tests
{
    /// <summary>Deterministic spread + clamp behavior for AttributeRoll (Task 1, unit-attributes L1).</summary>
    public class AttributeRollTests
    {
        static NPCDef Goblin() => new NPCDef(
            UnitType.Goblin, "creature.goblin", NPCCategory.Humanoid,
            40f, 100f, 30f, 100f, 100f, 0.7f, 0f, 5f, 0.5f, 0.285f, 0.20f,
            strength: 8, agility: 12, intellect: 4, will: 5, defaultWeapon: WeaponType.Club);

        [Test]
        public void Roll_MinNoise_IsEightyPercent()
        {
            var a = AttributeRoll.Roll(Goblin(), 0u);          // all lanes 0 -> 0.8x
            Assert.AreEqual(6, a.Strength);                    // round(8*0.8)=6
            Assert.AreEqual(10, a.Agility);                    // round(12*0.8)=10
        }

        [Test]
        public void Roll_MaxNoise_IsOneTwentyPercent()
        {
            var a = AttributeRoll.Roll(Goblin(), 0xFFFFFFFFu); // all lanes 255 -> 1.2x
            Assert.AreEqual(10, a.Strength);                   // round(8*1.2)=10
            Assert.AreEqual(14, a.Agility);                    // round(12*1.2)=14
        }

        [Test]
        public void Roll_IsDeterministic()
        {
            var a = AttributeRoll.Roll(Goblin(), 12345u);
            var b = AttributeRoll.Roll(Goblin(), 12345u);
            Assert.AreEqual(a.Strength, b.Strength);
            Assert.AreEqual(a.Agility, b.Agility);
            Assert.AreEqual(a.Intellect, b.Intellect);
            Assert.AreEqual(a.Will, b.Will);
        }

        [Test]
        public void Roll_ZeroBase_StaysZero()
        {
            var def = new NPCDef(
                UnitType.Chicken, "creature.chicken", NPCCategory.Beast,
                5f, 0f, 0f, 0f, 0f, 0.45f, 0f, 0f, 0f, 0f, 0f,
                strength: 0, agility: 10, intellect: 1, will: 1, defaultWeapon: WeaponType.None);
            var a = AttributeRoll.Roll(def, 0u);
            Assert.AreEqual(0, a.Strength);
        }
    }
}
