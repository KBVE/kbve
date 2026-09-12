using System;
using System.Collections.Generic;
using UnityEditor.Build;
using UnityEditor.Rendering;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon.EditorTools
{
    /// <summary>Strips ray-tracing shader variants from player builds. Rareicon is a 2D URP project (Renderer2D), so DXR / path-tracing / ReSTIR variants shipped by SRP Core are unreachable code — including them only inflates the player binary, slows builds, and spams "Platform doesn't support Ray Tracing Shader compilation" warnings on non-DXR runners. Strips graphics + compute shader paths by name pattern; the third pipeline (IPreprocessRayTracingShaders for RayTracingShader assets) lives in HDRP only and is intentionally omitted — URP doesn't author RayTracingShader assets, so there's nothing for it to catch on a 2D URP project.</summary>
    static class RayTracingShaderHeuristics
    {
        public static bool LooksLikeRayTracingShader(string name)
        {
            if (string.IsNullOrEmpty(name)) return false;
            if (name.IndexOf("RayTrac", StringComparison.OrdinalIgnoreCase) >= 0) return true;
            if (name.IndexOf("Raytracing", StringComparison.OrdinalIgnoreCase) >= 0) return true;
            if (name.IndexOf("PathTracing", StringComparison.OrdinalIgnoreCase) >= 0) return true;
            if (name.IndexOf("Restir", StringComparison.OrdinalIgnoreCase) >= 0) return true;
            if (name.IndexOf("DynamicGISkyOcclusion", StringComparison.OrdinalIgnoreCase) >= 0) return true;
            switch (name)
            {
                case "TraceRays":
                case "TraceVirtualOffset":
                case "TraceTransparentRays":
                case "TraceRenderingLayerMask":
                case "TraceRaysAndFetchAttributes":
                case "RisEstimation":
                case "UniformEstimation":
                    return true;
            }
            return false;
        }
    }

    public sealed class RayTracingGraphicsShaderStripper : IPreprocessShaders
    {
        public int callbackOrder => 0;

        public void OnProcessShader(Shader shader, ShaderSnippetData snippet, IList<ShaderCompilerData> data)
        {
            if (shader == null) return;
            if (RayTracingShaderHeuristics.LooksLikeRayTracingShader(shader.name)) data.Clear();
        }
    }

    public sealed class RayTracingComputeShaderStripper : IPreprocessComputeShaders
    {
        public int callbackOrder => 0;

        public void OnProcessComputeShader(ComputeShader shader, string kernelName, IList<ShaderCompilerData> data)
        {
            if (shader == null) return;
            if (RayTracingShaderHeuristics.LooksLikeRayTracingShader(shader.name)) data.Clear();
        }
    }

}
