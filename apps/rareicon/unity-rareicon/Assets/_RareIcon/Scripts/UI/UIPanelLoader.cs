using UnityEngine;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Shared loader for UXML+USS panels — instantiates the template into the host UIDocument with the wrapper-passthrough trick (full-screen absolute, picking ignored) so inner panels' anchor / width / height classes resolve correctly and the UXML's baked stylesheet stays attached.</summary>
    public static class UIPanelLoader
    {
        public static VisualElement Load(UIDocument host, string templatePath, string stylesPath = "UI/styles")
        {
            if (host == null || host.rootVisualElement == null) return null;

            var template = Resources.Load<VisualTreeAsset>(templatePath);
            if (template == null)
            {
                Debug.LogError($"[UIPanelLoader] Resources/{templatePath}.uxml not found");
                return null;
            }

            var tree = template.CloneTree();
            tree.style.position = Position.Absolute;
            tree.style.left   = 0;
            tree.style.right  = 0;
            tree.style.top    = 0;
            tree.style.bottom = 0;
            tree.pickingMode  = PickingMode.Ignore;

            var styles = Resources.Load<StyleSheet>(stylesPath);
            if (styles != null) tree.styleSheets.Add(styles);

            host.rootVisualElement.Add(tree);

            // Auto-apply YoRHA-style corner notches to every modal panel in
            // the loaded tree. Centralised here so every UXML panel picks
            // up the chrome without per-panel C# wiring.
            foreach (var modal in tree.Query<VisualElement>(className: "panel--modal").ToList())
                modal.AddCornerNotches();

            return tree;
        }
    }
}
