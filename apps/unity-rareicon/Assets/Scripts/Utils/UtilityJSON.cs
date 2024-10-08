using System;
using System.IO;
using System.Threading;
using Cysharp.Threading.Tasks;
using UnityEngine;

namespace Utils
{
    /// <summary>
    /// Utility class for handling JSON operations asynchronously.
    /// Provides methods for reading, writing, and parsing JSON files using UniTask for async support.
    /// </summary>
    public static class UtilityJSON
    {
        // Reads the JSON file content asynchronously and returns the string
        public static async UniTask<string> ReadFileAsync(string filePath)
        {
            try
            {
                if (!File.Exists(filePath))
                {
                    Debug.LogWarning($"File not found: {filePath}");
                    return null;
                }

                using (StreamReader reader = new StreamReader(filePath))
                {
                    return await reader.ReadToEndAsync();
                }
            }
            catch (Exception e)
            {
                Debug.LogError($"Failed to read file: {filePath}. Error: {e.Message}");
                return null;
            }
        }

        // Writes the JSON string content asynchronously to the specified file
        public static async UniTask<bool> WriteFileAsync(string filePath, string json)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(filePath) ?? string.Empty);

                using (StreamWriter writer = new StreamWriter(filePath, false))
                {
                    await writer.WriteAsync(json);
                }
                return true;
            }
            catch (Exception e)
            {
                Debug.LogError($"Failed to write file: {filePath}. Error: {e.Message}");
                return false;
            }
        }

        // Parses a JSON string into an object of type T asynchronously
        public static async UniTask<T> ParseJSONAsync<T>(string json) where T : class
        {
            return await UniTask.RunOnThreadPool(() =>
            {
                try
                {
                    if (string.IsNullOrWhiteSpace(json))
                    {
                        Debug.LogWarning("JSON string is null or empty.");
                        return null;
                    }
                    return JsonUtility.FromJson<T>(json);
                }
                catch (Exception e)
                {
                    Debug.LogError($"Failed to parse JSON. Error: {e.Message}");
                    return null;
                }
            });
        }

        // Converts an object of type T to a JSON string asynchronously
        public static async UniTask<string> ToJSONAsync<T>(T data) where T : class
        {
            return await UniTask.RunOnThreadPool(() =>
            {
                try
                {
                    if (data == null)
                    {
                        Debug.LogWarning("Data object is null.");
                        return null;
                    }
                    return JsonUtility.ToJson(data);
                }
                catch (Exception e)
                {
                    Debug.LogError($"Failed to serialize object to JSON. Error: {e.Message}");
                    return null;
                }
            });
        }
    }
}
