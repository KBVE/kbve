using UnityEngine;

public class VectorUtility : MonoBehaviour
{
    static public Vector3 FlattenVector(Vector3 vectorToFlatten)
    {
        return new Vector3(vectorToFlatten.x, 0f, vectorToFlatten.z);
    }
    static public Vector3 FlattenVector(Vector3 vectorToFlatten, float desiredYValue)
    {
        return new Vector3(vectorToFlatten.x, desiredYValue, vectorToFlatten.z);
    }
    static public Vector3 GetDirection(Vector3 from, Vector3 to)
    {
        return (to - from).normalized;
    }
    static public Vector3 Round(Vector3 vector3, int decimalPlaces)
    {
        float multiplier = 1;
        for (int i = 0; i < decimalPlaces; i++)
        {
            multiplier *= 10f;
        }
        return new Vector3(
            Mathf.Round(vector3.x * multiplier) / multiplier,
            Mathf.Round(vector3.y * multiplier) / multiplier,
            Mathf.Round(vector3.z * multiplier) / multiplier);
    }
    static public Vector3 Round(Vector3 vector3)
    {
        return new Vector3(
            Mathf.Round(vector3.x),
            Mathf.Round(vector3.y),
            Mathf.Round(vector3.z));
    }
}

