using ObservableCollections;
using UnityEngine;
using System;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.Orchestrator.Core;

namespace KBVE.MMExtensions.Orchestrator.Interfaces
{
    public interface IGlobalCanvas : IAsyncStartable, IDisposable
    {
        Canvas Canvas { get; }
        Transform Root { get; }

            ObservableList<GameObject> ToastPanels { get; }
            ObservableList<GameObject> ModalPanels { get; }
            ObservableList<GameObject> TooltipPanels { get; }

            Transform GetLayerRoot(UICanvasLayer layer);

            GameObject SpawnPanel(GameObject prefab, UICanvasLayer layer);
            void RemovePanel(GameObject panel, UICanvasLayer layer); 
    }
}