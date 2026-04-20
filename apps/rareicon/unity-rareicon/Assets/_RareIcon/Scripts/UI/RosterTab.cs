using Cysharp.Text;
using Unity.Collections;
using Unity.Entities;
using UnityEngine;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Citizens-panel tab listing every live Player unit with quick stats; click-to-focus camera will layer on later.</summary>
    public class RosterTab : ICitizensTab
    {
        public string Title => "Roster";

        Label _body;

        public VisualElement Build()
        {
            var root = new VisualElement();

            var header = UIStyles.MakeHeading("Citizens", fontSize: 13);
            header.style.marginBottom = 6;
            root.Add(header);

            _body = new Label(string.Empty);
            _body.style.color = UIStyles.Palette.TextStrong;
            _body.style.fontSize = 12;
            _body.style.whiteSpace = WhiteSpace.Normal;
            root.Add(_body);

            return root;
        }

        public void OnActivated() => Refresh();

        public void Dispose() { }

        void Refresh()
        {
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated)
            {
                _body.text = "No world loaded.";
                return;
            }
            var em = world.EntityManager;

            using var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<Unit>(),
                ComponentType.ReadOnly<Faction>());
            using var entities = query.ToEntityArray(Allocator.Temp);

            var sb = ZString.CreateStringBuilder();
            try
            {
                int count = 0;
                for (int i = 0; i < entities.Length; i++)
                {
                    var faction = em.GetComponentData<Faction>(entities[i]);
                    if (faction.Value != FactionType.Player) continue;
                    var unit = em.GetComponentData<Unit>(entities[i]);

                    if (count > 0) sb.Append('\n');
                    sb.Append(UnitTypeLabel(unit.Type));

                    if (em.HasComponent<Health>(entities[i]))
                    {
                        var h = em.GetComponentData<Health>(entities[i]);
                        sb.Append("  HP ");
                        sb.Append((int)Mathf.Round(h.Value));
                        sb.Append('/');
                        sb.Append((int)Mathf.Round(h.Max));
                    }
                    if (em.HasComponent<Hunger>(entities[i]))
                    {
                        var hg = em.GetComponentData<Hunger>(entities[i]);
                        sb.Append("  HU ");
                        sb.Append((int)Mathf.Round(hg.Value));
                    }
                    count++;
                }
                _body.text = count == 0 ? "No citizens yet." : sb.ToString();
            }
            finally { sb.Dispose(); }
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
