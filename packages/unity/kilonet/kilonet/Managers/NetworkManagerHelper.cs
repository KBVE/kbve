using System;
using System.Collections.Generic;
using System.IO;
using KBVE.Kilonet.Events;
using KBVE.Kilonet.Networks;
using UnityEngine;

namespace KBVE.Kilonet.Managers
{
  public class ConnectionProfile
  {
    public string Name;
    public string Uri;
    public ushort Port;
    public NetworkManagerHelper.TransportType TransportType;

    public ConnectionProfile(
      string name,
      string uri,
      ushort port,
      NetworkManagerHelper.TransportType transportType
    )
    {
      Name = name;
      Uri = uri;
      Port = port;
      TransportType = transportType;
    }
  }

  public class NetworkManagerHelper : MonoBehaviour
  {
    [Flags]
    public enum TransportType
    {
      None = 0,
      JsonWebsocket = 1 << 0, // 0000 0001
      WebSocket = 1 << 1, // 0000 0010
      BinaryWebSocket = 1 << 2, // 0000 0100
      JsonUDP = 1 << 3, // 0000 1000
      UDP = 1 << 4, // 0001 0000
      BinaryUDP = 1 << 5, // 0010 0000
      SecureWebSocket = 1 << 6, // 0100 0000
      SecureJsonWebSocket = 1 << 7, // 1000 0000
      SecureBinaryWebSocket = 1 << 8, // 0001 0000 0000
      SecureUDP = 1 << 9, // 0010 0000 0000
      SecureJsonUDP = 1 << 10, // 0100 0000 0000
      SecureBinaryUDP = 1 << 11 // 1000 0000 0000
    }



    private static JavaScriptListenerState listenerState = JavaScriptListenerState.Initializing;

    private static readonly Dictionary<TransportType, TransportType> SecureVariantMap =
      new()
      {
        { TransportType.JsonWebsocket, TransportType.SecureJsonWebSocket },
        { TransportType.WebSocket, TransportType.SecureWebSocket },
        { TransportType.BinaryWebSocket, TransportType.SecureBinaryWebSocket },
        { TransportType.JsonUDP, TransportType.SecureJsonUDP },
        { TransportType.UDP, TransportType.SecureUDP },
        { TransportType.BinaryUDP, TransportType.SecureBinaryUDP }
      };

    private static readonly Dictionary<TransportType, TransportType> VariantMap =
      new()
      {
        { TransportType.WebSocket, TransportType.JsonWebsocket },
        { TransportType.UDP, TransportType.JsonUDP }
      };

    // General transformation logic (e.g., WebSocket to JsonWebsocket)
    public static TransportType TransformToVariant(
      TransportType transportType,
      TransportType targetVariant
    )
    {
      if ((transportType & targetVariant) != 0)
      {
        return targetVariant;
      }

      if (VariantMap.TryGetValue(transportType, out var mappedVariant))
      {
        return mappedVariant;
      }

      throw new InvalidOperationException(
        $"No variant available for {transportType} to {targetVariant}."
      );
    }

    // Converts TransportType flags into a human-readable string
    public static string ToReadableString(TransportType transportType)
    {
      if (transportType == TransportType.None)
      {
        return "None";
      }

      var types = new List<string>();

      foreach (TransportType flag in Enum.GetValues(typeof(TransportType)))
      {
        if (flag != TransportType.None && (transportType & flag) == flag)
        {
          types.Add(flag.ToString());
        }
      }

      return string.Join(", ", types);
    }

    // Bitwise helpers
    public static bool HasFlag(TransportType value, TransportType flag) => (value & flag) == flag;

    public static bool HasAnyFlag(TransportType value, TransportType flags) => (value & flags) != 0;

    public static TransportType AddFlag(TransportType value, TransportType flag) => value | flag;

    public static TransportType RemoveFlag(TransportType value, TransportType flag) =>
      value & ~flag;

    public static TransportType ToggleFlag(TransportType value, TransportType flag) => value ^ flag;

    //? ConnectionProfiles Helpers

    private static readonly List<ConnectionProfile> Profiles =
      new()
      {
        new ConnectionProfile(
          "DiscordServer",
          "wss://1308198462155653180.discordsays.com/.proxy/ws",
          443,
          TransportType.WebSocket
        ),
        // TODO: Replace rareicon.com URLs with new server endpoints once the replacement project is onboarded.
        new ConnectionProfile(
          "WebSocketServer",
          "wss://discord.rareicon.com",
          443,
          TransportType.WebSocket
        ),
        new ConnectionProfile("UDPServer", "udp://discord.rareicon.com", 8081, TransportType.UDP),
        new ConnectionProfile(
          "SecureWebSocketServer",
          "wss://secure.rareicon.com",
          443,
          TransportType.SecureWebSocket
        )
      };

    public static ConnectionProfile GetProfile(string name, bool throwIfNotFound = true)
    {
      var profile = Profiles.Find(profile => profile.Name == name);
      if (profile == null && throwIfNotFound)
      {
        throw new InvalidOperationException($"Profile with name '{name}' not found.");
      }
      return profile;
    }

    public static void AddProfile(ConnectionProfile profile)
    {
      if (profile == null)
        throw new ArgumentNullException(nameof(profile), "Profile cannot be null.");
      if (Profiles.Exists(p => p.Name == profile.Name))
        throw new InvalidOperationException($"Profile with name '{profile.Name}' already exists.");
      Profiles.Add(profile);
    }

    public static void RemoveProfile(string name)
    {
      Profiles.RemoveAll(profile => profile.Name == name);
    }

    public static IEnumerable<string> GetAllProfileNames()
    {
      foreach (var profile in Profiles)
      {
        yield return profile.Name;
      }
    }

    public static void PrintAllProfiles()
    {
      Debug.Log("Available Profiles:");
      foreach (var profile in Profiles)
      {
        Debug.Log($"- {profile.Name}: {profile.Uri}:{profile.Port} ({profile.TransportType})");
      }
    }
  }
}
