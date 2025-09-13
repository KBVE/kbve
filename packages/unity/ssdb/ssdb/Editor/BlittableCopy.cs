using System;
using System.Collections.Generic;
using Puerts;
using UnityEngine.UIElements;
using OneJS;
using OneJS.Attributes;
using OneJS.Dom;

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