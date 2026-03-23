using k8s;
using k8s.Models;
using Serilog;
using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;

namespace OWSInstanceLauncher.Services
{
    public class AgonesAllocationResult
    {
        public string GameServerName { get; set; } = "";
        public string Address { get; set; } = "";
        public int Port { get; set; }
        public string State { get; set; } = "";
    }

    public class AgonesAllocator : IDisposable
    {
        private readonly IKubernetes _client;
        private readonly string _namespace;
        private readonly string _fleetName;

        public AgonesAllocator(string fleetNamespace = "ows", string fleetName = "ows-hubworld")
        {
            _namespace = fleetNamespace;
            _fleetName = fleetName;

            // In-cluster config (ServiceAccount token)
            var config = KubernetesClientConfiguration.InClusterConfig();
            _client = new Kubernetes(config);

            Log.Information("AgonesAllocator initialized for fleet {Fleet} in namespace {Namespace}", _fleetName, _namespace);
        }

        /// <summary>
        /// Allocate a GameServer from the Agones Fleet.
        /// Creates a GameServerAllocation CR via the Kubernetes API.
        /// </summary>
        public async Task<AgonesAllocationResult?> AllocateAsync(string mapName, int zoneInstanceId)
        {
            var allocation = new Dictionary<string, object>
            {
                ["apiVersion"] = "allocation.agones.dev/v1",
                ["kind"] = "GameServerAllocation",
                ["metadata"] = new Dictionary<string, object>
                {
                    ["namespace"] = _namespace
                },
                ["spec"] = new Dictionary<string, object>
                {
                    ["required"] = new Dictionary<string, object>
                    {
                        ["matchLabels"] = new Dictionary<string, string>
                        {
                            ["agones.dev/fleet"] = _fleetName
                        }
                    },
                    ["metadata"] = new Dictionary<string, object>
                    {
                        ["labels"] = new Dictionary<string, string>
                        {
                            ["ows.kbve.com/map"] = mapName,
                            ["ows.kbve.com/zone-instance"] = zoneInstanceId.ToString()
                        }
                    }
                }
            };

            try
            {
                var json = JsonSerializer.Serialize(allocation);
                var response = await _client.CustomObjects.CreateNamespacedCustomObjectAsync(
                    body: JsonSerializer.Deserialize<object>(json),
                    group: "allocation.agones.dev",
                    version: "v1",
                    namespaceParameter: _namespace,
                    plural: "gameserverallocations"
                );

                var responseJson = JsonSerializer.Serialize(response);
                var responseDoc = JsonDocument.Parse(responseJson);
                var root = responseDoc.RootElement;

                var state = root.GetProperty("status").GetProperty("state").GetString() ?? "";

                if (state != "Allocated")
                {
                    Log.Warning("GameServerAllocation state is {State}, not Allocated. No servers available?", state);
                    return null;
                }

                var address = root.GetProperty("status").GetProperty("address").GetString() ?? "";
                var ports = root.GetProperty("status").GetProperty("ports");
                int port = 0;
                if (ports.GetArrayLength() > 0)
                {
                    port = ports[0].GetProperty("port").GetInt32();
                }

                var gsName = root.GetProperty("status").GetProperty("nodeName").GetString() ?? "";
                // Try to get the actual GameServer name
                if (root.GetProperty("status").TryGetProperty("gameServerName", out var gsNameProp))
                {
                    gsName = gsNameProp.GetString() ?? gsName;
                }

                var result = new AgonesAllocationResult
                {
                    GameServerName = gsName,
                    Address = address,
                    Port = port,
                    State = state
                };

                Log.Information("Allocated GameServer {Name} at {Address}:{Port} for map {Map} zone {Zone}",
                    result.GameServerName, result.Address, result.Port, mapName, zoneInstanceId);

                return result;
            }
            catch (Exception ex)
            {
                Log.Error(ex, "Failed to create GameServerAllocation for map {Map} zone {Zone}", mapName, zoneInstanceId);
                return null;
            }
        }

        /// <summary>
        /// Delete a GameServer by name (shutdown).
        /// </summary>
        public async Task<bool> DeallocateAsync(string gameServerName)
        {
            try
            {
                await _client.CustomObjects.DeleteNamespacedCustomObjectAsync(
                    group: "agones.dev",
                    version: "v1",
                    namespaceParameter: _namespace,
                    plural: "gameservers",
                    name: gameServerName
                );

                Log.Information("Deleted GameServer {Name}", gameServerName);
                return true;
            }
            catch (Exception ex)
            {
                Log.Error(ex, "Failed to delete GameServer {Name}", gameServerName);
                return false;
            }
        }

        public void Dispose()
        {
            _client?.Dispose();
        }
    }
}
