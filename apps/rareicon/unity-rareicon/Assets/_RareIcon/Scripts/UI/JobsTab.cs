using Cysharp.Text;
using Unity.Collections;
using Unity.Entities;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Citizens "Jobs" tab — per-UnitType priority editor (0-5 per job, multiple jobs per unit). Writes JobPreferencesStore + mutates all live units of that type on Apply.</summary>
    public class JobsTab : ICitizensTab
    {
        static readonly byte[] UnitTypes = { UnitType.Goblin, UnitType.Soldier, UnitType.Knight, UnitType.Mage, UnitType.King };
        static readonly (byte Kind, string Label)[] Jobs = new (byte, string)[]
        {
            (JobKind.Looter,     "Looter"),
            (JobKind.Lumberjack, "Lumberjack"),
            (JobKind.Miner,      "Miner"),
            (JobKind.Guard,      "Guard"),
            (JobKind.Farmer,     "Farmer"),
            (JobKind.Builder,    "Builder"),
            (JobKind.Chef,       "Chef"),
            (JobKind.Blacksmith, "Blacksmith"),
        };

        public string Title => "Jobs";

        DropdownField _unitTypeDropdown;
        UIControls.StepperHandle[] _rows;
        JobPriorities _working;
        byte _selectedUnitType = UnitType.Goblin;

        public VisualElement Build()
        {
            var root = new VisualElement();

            _unitTypeDropdown = new DropdownField { choices = new System.Collections.Generic.List<string>() };
            for (int i = 0; i < UnitTypes.Length; i++)
                _unitTypeDropdown.choices.Add(UnitTypeLabel(UnitTypes[i]));
            _unitTypeDropdown.index = 0;
            _unitTypeDropdown.AddToClassList("cz-dropdown");
            _unitTypeDropdown.RegisterValueChangedCallback(_ =>
            {
                _selectedUnitType = UnitTypes[_unitTypeDropdown.index];
                LoadFromSelected();
            });
            root.Add(_unitTypeDropdown);

            _rows = new UIControls.StepperHandle[Jobs.Length];
            for (int i = 0; i < Jobs.Length; i++)
            {
                int capturedIdx = i;
                _rows[i] = UIControls.MakeStepperRow(
                    Jobs[i].Label,
                    initial: 0, min: 0, max: 5,
                    onChange: v => _working.Set(Jobs[capturedIdx].Kind, (byte)v));
                root.Add(_rows[i].Row);
            }

            var footer = new VisualElement();
            footer.AddToClassList("roster-detail__actions");
            footer.style.marginTop = 10;

            var applyBtn = MakeBtn("Apply", ApplyToLiveUnits);
            footer.Add(applyBtn);

            var resetBtn = MakeBtn("Reset", ResetToDefaults);
            footer.Add(resetBtn);

            root.Add(footer);

            var hint = new Label("0 = never · 5 = top priority. Units pick the highest-priority job they can do.");
            hint.AddToClassList("cz-hint");
            root.Add(hint);

            return root;
        }

        static Button MakeBtn(string text, System.Action onClick)
        {
            var b = new Button(() => onClick?.Invoke()) { text = text };
            b.AddToClassList("btn");
            b.AddToClassList("btn--sm");
            return b;
        }

        public void OnActivated() => LoadFromSelected();
        public void Dispose() { }

        void LoadFromSelected()
        {
            _working = JobPreferencesStore.GetOrDefault(_selectedUnitType);
            for (int i = 0; i < Jobs.Length; i++)
                _rows[i].SetValue(_working.Get(Jobs[i].Kind));
        }

        void ApplyToLiveUnits()
        {
            JobPreferencesStore.Set(_selectedUnitType, _working);

            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            using var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<Unit>(),
                ComponentType.ReadWrite<JobPriorities>());
            using var entities = query.ToEntityArray(Allocator.Temp);
            int applied = 0;
            for (int i = 0; i < entities.Length; i++)
            {
                var u = em.GetComponentData<Unit>(entities[i]);
                if (u.Type != _selectedUnitType) continue;
                em.SetComponentData(entities[i], _working);
                applied++;
            }

            var toast = MessagePipe.GlobalMessagePipe.GetPublisher<ToastMessage>();
            toast.Publish(new ToastMessage(
                ZString.Format("Jobs applied to {0} ({1} units)",
                    UnitTypeLabel(_selectedUnitType), applied),
                ToastKind.Success));
        }

        void ResetToDefaults()
        {
            _working = JobDefaults.Get(_selectedUnitType);
            JobPreferencesStore.Clear(_selectedUnitType);
            for (int i = 0; i < Jobs.Length; i++)
                _rows[i].SetValue(_working.Get(Jobs[i].Kind));
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
