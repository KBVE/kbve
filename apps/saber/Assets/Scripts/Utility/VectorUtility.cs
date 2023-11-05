using UnityEngine;

public class VectorUtility
{
    static public Vector3 FlattenVector(Vector3 vectorToFlatten, float desiredYValue = 0)
    {
        return new Vector3(vectorToFlatten.x, desiredYValue, vectorToFlatten.z);
    }
    static public Vector3 CalculateDirection(Vector3 from, Vector3 to)
    {
        return (to - from).normalized;
    }
    static public Vector3 Round(Vector3 vector3, int decimalPlaces = 0)
    {
        float multiplier = Mathf.Pow(10f, decimalPlaces);
        
        return new Vector3(
            Mathf.Round(vector3.x * multiplier) / multiplier,
            Mathf.Round(vector3.y * multiplier) / multiplier,
            Mathf.Round(vector3.z * multiplier) / multiplier);
    }
}

