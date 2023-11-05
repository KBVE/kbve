using UnityEngine;

public struct VectorUtility
{
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

