using Cysharp.Text;
using Unity.Collections;
using Unity.Entities;
using UnityEngine;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Citizens-panel tab showing average skill levels across all live units of the selected UnitType; progresses via SkillProgressionSystem.</summary>
    public class SkillsTab : ICitizensTab
    {
        static readonly byte[] UnitTypes = { UnitType.Goblin, UnitType.Soldier, UnitType.Knight, UnitType.Mage, UnitType.King };
        static readonly (byte Kind, string Label)[] SkillRows = new (byte, string)[]
        {
            (SkillKind.Foraging,   "Foraging"),
            (SkillKind.Lumberjack, "Lumberjack"),
            (SkillKind.Mining,     "Mining"),
            (SkillKind.Combat,     "Combat"),
            (SkillKind.Scavenging, "Scavenging"),
            (SkillKind.Husbandry,  "Husbandry"),
        };

        public string Title => "Skills";

        DropdownField _unitTypeDropdown;
        Label[] _skillLabels;
        IVisualElementScheduledItem _refreshTick;
        byte _selectedUnitType = UnitType.Goblin;
        VisualElement _root;

        public VisualElement Build()
        {
            _root = new VisualElement();

            _unitTypeDropdown = new DropdownField { choices = new System.Collections.Generic.List<string>() };
            for (int i = 0; i < UnitTypes.Length; i++)
                _unitTypeDropdown.choices.Add(UnitTypeLabel(UnitTypes[i]));
            _unitTypeDropdown.index = 0;
            _unitTypeDropdown.style.marginBottom = 8;
            _unitTypeDropdown.RegisterValueChangedCallback(_ =>
            {
                _selectedUnitType = UnitTypes[_unitTypeDropdown.index];
                Refresh();
            });
            _root.Add(_unitTypeDropdown);

            _skillLabels = new Label[SkillRows.Length];
            for (int i = 0; i < SkillRows.Length; i++)
            {
                var row = new VisualElement();
                row.style.flexDirection = FlexDirection.Row;
                row.style.alignItems = Align.Center;
                row.style.marginTop = 4;

                var name = new Label(SkillRows[i].Label);
                name.style.color = UIStyles.Palette.TextStrong;
                name.style.fontSize = 13;
                name.style.flexGrow = 1;
                row.Add(name);

                var value = new Label("—");
                value.style.color = UIStyles.Palette.Gold;
                value.style.fontSize = 13;
                value.style.width = 64;
                value.style.unityTextAlign = TextAnchor.MiddleRight;
                _skillLabels[i] = value;
                row.Add(value);

                _root.Add(row);
            }

            var hint = new Label("Averaged across all live units of this type.");
            hint.style.color = UIStyles.Palette.TextMuted;
            hint.style.fontSize = 11;
            hint.style.marginTop = 10;
            hint.style.whiteSpace = WhiteSpace.Normal;
            _root.Add(hint);

            return _root;
        }

        public void OnActivated()
        {
            Refresh();
            _refreshTick?.Pause();
            _refreshTick = _root.schedule.Execute(Refresh).Every(1000);
        }

        public void Dispose()
        {
            _refreshTick?.Pause();
            _refreshTick = null;
        }

        void Refresh()
        {
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            using var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<Unit>(),
                ComponentType.ReadOnly<Skills>());
            using var entities = query.ToEntityArray(Allocator.Temp);

            int count = 0;
            int[] sums = new int[SkillRows.Length];
            for (int i = 0; i < entities.Length; i++)
            {
                var unit = em.GetComponentData<Unit>(entities[i]);
                if (unit.Type != _selectedUnitType) continue;

                var s = em.GetComponentData<Skills>(entities[i]);
                for (int k = 0; k < SkillRows.Length; k++)
                    sums[k] += s.Get(SkillRows[k].Kind);
                count++;
            }

            if (count == 0)
            {
                for (int k = 0; k < SkillRows.Length; k++) _skillLabels[k].text = "—";
                return;
            }

            for (int k = 0; k < SkillRows.Length; k++)
            {
                float avg = sums[k] / (float)count;
                _skillLabels[k].text = ZString.Format("Lv {0:0.0} / {1}", avg, Skills.SkillCap);
            }
        }

        static string UnitTypeLabel(byte unitType) => unitType switch
        {
            UnitType.Goblin  => "Goblin",
            UnitType.Soldier => "Soldier",
            UnitType.Knight  => "Knight",
            UnitType.Mage    => "Mage",
            UnitType.King    => "King",
            _                => "Unit",
        };
    }
}
