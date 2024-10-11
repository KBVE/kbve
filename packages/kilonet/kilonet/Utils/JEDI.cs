using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using Cysharp.Threading.Tasks;
using UnityEngine;

namespace KBVE.Kilonet.Utils
{
    public static class JEDI
    {
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

        // Writes a JSON string to a file asynchronously
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

public static async UniTask<T> ParseJSONAsync<T>(string json) where T : class
{
    return await UniTask.Run(() =>
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

public static async UniTask<string> ToJSONAsync<T>(T data) where T : class
{
    return await UniTask.Run(() =>
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
        // Synchronous method to parse JSON using MiniJSON.Parser
        public static object ParseMiniJSON(string json)
        {
            return MiniJSON.Json.Deserialize(json);
        }

        // Synchronous method to serialize an object using MiniJSON.Serializer
        public static string SerializeMiniJSON(object obj)
        {
            return MiniJSON.Json.Serialize(obj);
        }

        // Helper class for custom MiniJSON parsing and serializing operations
        private static class MiniJSON
        {
            public static class Json
            {
                public static object Deserialize(string json)
                {
                    if (json == null)
                    {
                        return null;
                    }

                    return Parser.Parse(json);
                }

                public static string Serialize(object obj)
                {
                    if (obj == null)
                    {
                        return "null";
                    }

                    StringBuilder builder = new StringBuilder();
                    Serializer.Serialize(obj, builder);
                    return builder.ToString();
                }

                sealed class Parser : IDisposable
                {
                    const string WORD_BREAK = "{}[],:\"";
                    StringReader json;

                    Parser(string jsonString)
                    {
                        json = new StringReader(jsonString);
                    }

                    public static object Parse(string jsonString)
                    {
                        using (var instance = new Parser(jsonString))
                        {
                            return instance.ParseValue();
                        }
                    }

                    public void Dispose()
                    {
                        json.Dispose();
                        json = null;
                    }

                    Dictionary<string, object> ParseObject()
                    {
                        Dictionary<string, object> table = new Dictionary<string, object>();
                        json.Read();
                        while (true)
                        {
                            switch (NextToken)
                            {
                                case Token.NONE:
                                    return null;
                                case Token.COMMA:
                                    continue;
                                case Token.CURLY_CLOSE:
                                    return table;
                                default:
                                    string name = ParseString();
                                    if (name == null) return null;
                                    if (NextToken != Token.COLON) return null;
                                    json.Read();
                                    table[name] = ParseValue();
                                    break;
                            }
                        }
                    }

                    List<object> ParseArray()
                    {
                        List<object> array = new List<object>();
                        json.Read();
                        while (true)
                        {
                            switch (NextToken)
                            {
                                case Token.NONE:
                                    return null;
                                case Token.COMMA:
                                    continue;
                                case Token.SQUARED_CLOSE:
                                    return array;
                                default:
                                    array.Add(ParseValue());
                                    break;
                            }
                        }
                    }

                    object ParseValue()
                    {
                        switch (NextToken)
                        {
                            case Token.STRING:
                                return ParseString();
                            case Token.NUMBER:
                                return ParseNumber();
                            case Token.CURLY_OPEN:
                                return ParseObject();
                            case Token.SQUARED_OPEN:
                                return ParseArray();
                            case Token.TRUE:
                                return true;
                            case Token.FALSE:
                                return false;
                            case Token.NULL:
                                return null;
                            default:
                                return null;
                        }
                    }

                    string ParseString()
                    {
                        StringBuilder s = new StringBuilder();
                        json.Read();
                        while (true)
                        {
                            char c = NextChar;
                            switch (c)
                            {
                                case '"':
                                    return s.ToString();
                                case '\\':
                                    c = NextChar;
                                    switch (c)
                                    {
                                        case '"': case '\\': case '/': s.Append(c); break;
                                        case 'b': s.Append('\b'); break;
                                        case 'f': s.Append('\f'); break;
                                        case 'n': s.Append('\n'); break;
                                        case 'r': s.Append('\r'); break;
                                        case 't': s.Append('\t'); break;
                                        case 'u':
                                            char[] hex = new char[4];
                                            for (int i = 0; i < 4; i++) hex[i] = NextChar;
                                            s.Append((char)Convert.ToInt32(new string(hex), 16));
                                            break;
                                    }
                                    break;
                                default:
                                    s.Append(c);
                                    break;
                            }
                        }
                    }

                    object ParseNumber()
                    {
                        string number = NextWord;
                        if (number.IndexOf('.') == -1)
                        {
                            long.TryParse(number, out var parsedInt);
                            return parsedInt;
                        }
                        double.TryParse(number, out var parsedDouble);
                        return parsedDouble;
                    }

                    void EatWhitespace()
                    {
                        while (Char.IsWhiteSpace(PeekChar)) json.Read();
                    }

                    char PeekChar => Convert.ToChar(json.Peek());
                    char NextChar => Convert.ToChar(json.Read());
                    string NextWord
                    {
                        get
                        {
                            StringBuilder word = new StringBuilder();
                            while (!IsWordBreak(PeekChar)) word.Append(NextChar);
                            return word.ToString();
                        }
                    }

                    static bool IsWordBreak(char c) => Char.IsWhiteSpace(c) || "{}[],:\"".IndexOf(c) != -1;

                    Token NextToken
                    {
                        get
                        {
                            EatWhitespace();
                            if (json.Peek() == -1) return Token.NONE;

                            switch (PeekChar)
                            {
                                case '{': return Token.CURLY_OPEN;
                                case '}': json.Read(); return Token.CURLY_CLOSE;
                                case '[': return Token.SQUARED_OPEN;
                                case ']': json.Read(); return Token.SQUARED_CLOSE;
                                case ',': json.Read(); return Token.COMMA;
                                case '"': return Token.STRING;
                                case ':': return Token.COLON;
                                case '0': case '1': case '2': case '3': case '4':
                                case '5': case '6': case '7': case '8': case '9': case '-':
                                    return Token.NUMBER;
                                case 'f': if (NextWord == "false") return Token.FALSE; break;
                                case 't': if (NextWord == "true") return Token.TRUE; break;
                                case 'n': if (NextWord == "null") return Token.NULL; break;
                            }

                            return Token.NONE;
                        }
                    }

                    enum Token { NONE, CURLY_OPEN, CURLY_CLOSE, SQUARED_OPEN, SQUARED_CLOSE, COLON, COMMA, STRING, NUMBER, TRUE, FALSE, NULL }
                }

                sealed class Serializer
                {
                    StringBuilder builder;

                    Serializer() { builder = new StringBuilder(); }

                    public static void Serialize(object obj, StringBuilder builder)
                    {
                        new Serializer { builder = builder }.SerializeValue(obj);
                    }

                    void SerializeValue(object value)
                    {
                        switch (value)
                        {
                            case string s: SerializeString(s); break;
                            case bool b: builder.Append(b ? "true" : "false"); break;
                            case IList<object> list: SerializeArray(list); break;
                            case IDictionary<string, object> dict: SerializeObject(dict); break;
                            case char c: SerializeString(c.ToString()); break;
                            case double d: builder.Append(d.ToString("R")); break;
                            case float f: builder.Append(f.ToString("R")); break;
                            case int i: builder.Append(i); break;
                            case long l: builder.Append(l); break;
                            case null: builder.Append("null"); break;
                            default: SerializeString(value.ToString()); break;
                        }
                    }

                    void SerializeObject(IDictionary<string, object> obj)
                    {
                        bool first = true;
                        builder.Append('{');
                        foreach (var e in obj.Keys)
                        {
                            if (!first) builder.Append(',');
                            SerializeString(e.ToString());
                            builder.Append(':');
                            SerializeValue(obj[e]);
                            first = false;
                        }
                        builder.Append('}');
                    }

                    void SerializeArray(IList<object> array)
                    {
                        builder.Append('[');
                        bool first = true;
                        foreach (var obj in array)
                        {
                            if (!first) builder.Append(',');
                            SerializeValue(obj);
                            first = false;
                        }
                        builder.Append(']');
                    }

                    void SerializeString(string str)
                    {
                        builder.Append('"');
                        foreach (char c in str)
                        {
                            switch (c)
                            {
                                case '"': builder.Append("\\\""); break;
                                case '\\': builder.Append("\\\\"); break;
                                case '\b': builder.Append("\\b"); break;
                                case '\f': builder.Append("\\f"); break;
                                case '\n': builder.Append("\\n"); break;
                                case '\r': builder.Append("\\r"); break;
                                case '\t': builder.Append("\\t"); break;
                                default: builder.Append(c); break;
                            }
                        }
                        builder.Append('"');
                    }
                }
            }
        }
    }
}
