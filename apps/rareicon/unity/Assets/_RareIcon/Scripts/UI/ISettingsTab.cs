using System;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Contract for a tab hosted inside UISettings — build once, refresh on activation.</summary>
    public interface ISettingsTab : IDisposable
    {
        string Title { get; }
        VisualElement Build();
        void OnActivated();
    }
}
