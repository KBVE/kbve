using Mathf = UnityEngine.Mathf;
using Vector3 = UnityEngine.Vector3;

public struct VectorUtility
{
    /// <summary>
    /// Returns a new Vector3 with the same x and z values as vecToFlatten, but with a y value of desiredYValue.
    /// </summary>
    /// <param name="vecToFlatten">The input Vector3 to be flattened.</param>
    /// <param name="desiredYValue">The desired Y value for the flattened Vector3 (default is 0).</param>
    /// <returns>A new Vector3 with the x and z values of vecToFlatten and the specified y value.</returns>
    public static Vector3 FlattenVector(Vector3 vecToFlatten, float desiredYValue = 0)
    {
        return new Vector3(vecToFlatten.x, desiredYValue, vecToFlatten.z);
    }

    public static Vector3 CalculateDirection(Vector3 a, Vector3 b, bool normalize = true)
    {
        return normalize ? (b - a).normalized : (b - a);
    }

    public static void Round(ref Vector3 vec, int decimalPlaces = 0)
    {
        float multiplier = Mathf.Pow(10f, decimalPlaces);
        vec.x = Mathf.Round(vec.x * multiplier) / multiplier;
        vec.y = Mathf.Round(vec.y * multiplier) / multiplier;
        vec.z = Mathf.Round(vec.z * multiplier) / multiplier;
    }
}
