using System.Collections.Generic;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Citizens-panel tab for per-UnitType item preferences (0 = skip, 5 = top preference); HarvestSystem consults DietPreferencesStore before picking a resource on arrival.</summary>
    public class DietTab : ICitizensTab
    {
        static readonly byte[] UnitTypes = { UnitType.Goblin, UnitType.Soldier, UnitType.Knight, UnitType.Mage, UnitType.King };
        static readonly (HarvestRole Role, string Label)[] Sections = new (HarvestRole, string)[]
        {
            (HarvestRole.Forager,    "Forager"),
            (HarvestRole.Lumberjack, "Lumberjack"),
            (HarvestRole.Miner,      "Miner"),
        };

        public string Title => "Diet";

        readonly LocaleService _locale;
        DropdownField _unitTypeDropdown;
        VisualElement _rowHost;
        byte _selectedUnitType = UnitType.Goblin;

        public DietTab(LocaleService locale) { _locale = locale; }

        public VisualElement Build()
        {
            var root = new VisualElement();

            _unitTypeDropdown = new DropdownField { choices = new List<string>() };
            for (int i = 0; i < UnitTypes.Length; i++)
                _unitTypeDropdown.choices.Add(UnitTypeLabel(UnitTypes[i]));
            _unitTypeDropdown.index = 0;
            _unitTypeDropdown.style.marginBottom = 8;
            _unitTypeDropdown.RegisterValueChangedCallback(_ =>
            {
                _selectedUnitType = UnitTypes[_unitTypeDropdown.index];
                BuildRows();
            });
            root.Add(_unitTypeDropdown);

            _rowHost = new VisualElement();
            root.Add(_rowHost);

            BuildRows();

            var hint = new Label("0 = skip · 5 = top preference.");
            hint.style.color = UIStyles.Palette.TextMuted;
            hint.style.fontSize = 11;
            hint.style.marginTop = 10;
            hint.style.whiteSpace = WhiteSpace.Normal;
            root.Add(hint);

            return root;
        }

        public void OnActivated() => BuildRows();

        public void Dispose() { }

        void BuildRows()
        {
            _rowHost.Clear();

            for (int s = 0; s < Sections.Length; s++)
            {
                var sec = Sections[s];
                var header = UIStyles.MakeHeading(sec.Label, fontSize: 12);
                header.style.marginTop = s == 0 ? 2 : 8;
                header.style.marginBottom = 2;
                _rowHost.Add(header);

                foreach (var def in ItemDB.EnumerateByRole(sec.Role))
                {
                    ushort itemId = def.Id;
                    var stepper = UIControls.MakeStepperRow(
                        label: _locale.GetItemName(itemId),
                        initial: DietPreferencesStore.Get(_selectedUnitType, itemId),
                        min: 0, max: DietPreferencesStore.MaxPreference,
                        onChange: v => DietPreferencesStore.Set(_selectedUnitType, itemId, (byte)v));
                    _rowHost.Add(stepper.Row);
                }
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
