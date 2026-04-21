using System;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Contract for a tab hosted inside UICitizensPanel — build once, refresh on activation.</summary>
    public interface ICitizensTab : IDisposable
    {
        string Title { get; }
        VisualElement Build();
        void OnActivated();
    }
}
