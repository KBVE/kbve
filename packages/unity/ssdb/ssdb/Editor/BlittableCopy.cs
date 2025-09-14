using System;
using System.Collections.Generic;
using Puerts;
using UnityEngine.UIElements;
using OneJS;
using OneJS.Attributes;
using OneJS.Dom;
using R3;
using ObservableCollections;

#if UNITY_EDITOR
namespace KBVE.SSDB.Editor {
    [Configure]
    public class PuertsCfg {
        [CodeOutputDirectory]
        static string OutputDir => UnityEngine.Application.dataPath + "/_gen/";

        // Declare here the C# types that your JS code may reference. 
        // Generally, you want to focus on types on hot paths.
        [Binding]
        static IEnumerable<Type> Bindings {
            get {
                return new List<Type>() {
                    typeof(UnityEngine.Rect),
                    typeof(UnityEngine.Color),
                    typeof(UnityEngine.Color32),
                    typeof(UnityEngine.Vector2),
                    typeof(UnityEngine.Vector3),
                    typeof(UnityEngine.Quaternion),
                    typeof(VisualElement),
                    typeof(MeshGenerationContext),
                    typeof(Painter2D),
                    typeof(OneJS.Dom.Document),
                    typeof(OneJS.Dom.Dom),
                    typeof(OneJS.Dom.DomStyle),
                    // R3 Observable Types
                    typeof(ReactiveProperty<>),
                    typeof(ReadOnlyReactiveProperty<>),
                    typeof(ReactiveCommand),
                    typeof(ReactiveCommand<>),
                    typeof(Subject<>),
                    typeof(Observable),
                    typeof(R3.ObservableExtensions),
                    // ObservableCollections Types
                    typeof(ObservableList<>),
                    typeof(ObservableDictionary<,>),
                    typeof(ObservableHashSet<>),
                    typeof(ObservableQueue<>),
                    typeof(ObservableStack<>),
                    typeof(IObservableCollection<>),
                    typeof(NotifyCollectionChangedEventArgs<>),
                    typeof(CollectionAddEvent<>),
                    typeof(CollectionRemoveEvent<>),
                    typeof(CollectionReplaceEvent<>),
                };
            }
        }

        // Declare here any struct you'll be using during interop. PuerTS will 
        // optimize the memory usage, eliminating GC in most cases.
        [BlittableCopy]
        static IEnumerable<Type> Blittables {
            get {
                return new List<Type>() {
                    typeof(UnityEngine.Rect),
                    typeof(UnityEngine.Color),
                    typeof(UnityEngine.Color32),
                    typeof(UnityEngine.Vector2),
                    typeof(UnityEngine.Vector3),
                    typeof(UnityEngine.Quaternion),
                };
            }
        }
    }
}

#endif


/* 

The MIT License (MIT) -> https://kbve.com/legal/mit/
Copyright (c) 2025-present Singtaa, DragonGround LLC, 普洱, KBVE, Tencent.

*/