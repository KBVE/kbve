using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using OWSData.Models;
using OWSData.Repositories.Interfaces;
using OWSShared.Interfaces;
using OWSShared.Messages;
using OWSShared.Options;
using OWSShared.RequestPayloads;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Serilog;

namespace OWSInstanceLauncher.Services
{
    public class ServerLauncherMQListener : IInstanceLauncherJob //BackgroundService
    {
        private IConnection connection;
        private IModel serverSpinUpChannel;
        private IModel serverShutDownChannel;
        private Guid serverSpinUpQueueNameGUID;
        private Guid serverShutDownQueueNameGUID;

        private readonly Guid _customerGUID;
        private readonly Guid _launcherGUID;
        private readonly IWritableOptions<OWSInstanceLauncherOptions> _owsInstanceLauncherOptions;
        private readonly IOptions<APIPathOptions> _owsAPIPathOptions;
        private readonly IOptions<RabbitMQOptions> _rabbitMQOptions;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IZoneServerProcessesRepository _zoneServerProcessesRepository;
        private readonly IOWSInstanceLauncherDataRepository _owsInstanceLauncherDataRepository;
        private readonly int _worldServerId;
        private readonly string _serverIP;
        private readonly int _MaxNumberOfInstances;
        private readonly string _InternalServerIP;
        private readonly int _StartingInstancePort;
        private readonly AgonesAllocator _agonesAllocator;
        // Maps zoneInstanceId → Agones GameServer name for shutdown
        private readonly Dictionary<int, string> _zoneToGameServer = new();

        public ServerLauncherMQListener(IWritableOptions<OWSInstanceLauncherOptions> owsInstanceLauncherOptions, IOptions<APIPathOptions> owsAPIPathOptions, IOptions<RabbitMQOptions> rabbitMQOptions, IHttpClientFactory httpClientFactory, IZoneServerProcessesRepository zoneServerProcessesRepository,
            IOWSInstanceLauncherDataRepository owsInstanceLauncherDataRepository)
        {
            _owsInstanceLauncherOptions = owsInstanceLauncherOptions;
            _owsAPIPathOptions = owsAPIPathOptions;
            _rabbitMQOptions = rabbitMQOptions;
            _httpClientFactory = httpClientFactory;
            _zoneServerProcessesRepository = zoneServerProcessesRepository;
            _owsInstanceLauncherDataRepository = owsInstanceLauncherDataRepository;
            _customerGUID = Guid.Parse(owsInstanceLauncherOptions.Value.OWSAPIKey);
            if (String.IsNullOrEmpty(owsInstanceLauncherOptions.Value.LauncherGuid))
            {
                _launcherGUID = Guid.NewGuid();
                _owsInstanceLauncherOptions.Update(x => x.LauncherGuid = _launcherGUID.ToString());
                Log.Information($"New Launcher GUID Generated: {_launcherGUID}");
            }
            else
            {
                _launcherGUID = Guid.Parse(owsInstanceLauncherOptions.Value.LauncherGuid);
            }
            _serverIP = owsInstanceLauncherOptions.Value.ServerIP;
            _MaxNumberOfInstances = owsInstanceLauncherOptions.Value.MaxNumberOfInstances;
            _InternalServerIP = owsInstanceLauncherOptions.Value.InternalServerIP;
            _StartingInstancePort = owsInstanceLauncherOptions.Value.StartingInstancePort;

            // Initialize Agones allocator for GameServer lifecycle
            var agonesNamespace = Environment.GetEnvironmentVariable("AGONES_NAMESPACE") ?? "ows";
            var agonesFleet = Environment.GetEnvironmentVariable("AGONES_FLEET") ?? "ows-hubworld";
            _agonesAllocator = new AgonesAllocator(agonesNamespace, agonesFleet);

            RegisterLauncher();

            _worldServerId = GetWorldServerID();

            InitRabbitMQ();
        }

        public void RegisterLauncher()
        {
            Log.Information($"Attempting to register Launcher GUID: {_launcherGUID}");
            var isregistered = RegisterInstanceLauncherRequest();

            if (isregistered == 1)
            {
                Log.Information($"Success!  Registered: {_launcherGUID}");
            }
            else
            {
                Log.Error($"Error Registering: {_launcherGUID}");
            }
        }

        /*
        private Guid GetLauncherGuid()
        {
            return Guid.Parse(File.ReadAllText("Guid.txt"));
        }
        */

        private int GetWorldServerID()
        {
            int worldServerID = _owsInstanceLauncherDataRepository.GetWorldServerID();

            if (worldServerID < 1)
            {
                worldServerID = StartInstanceLauncherRequest();
                _owsInstanceLauncherDataRepository.SetWorldServerID(worldServerID);
            }

            return worldServerID;
        }

        private void InitRabbitMQ()
        {
            Log.Information("Attempting to Register OWS Instance Launcher with RabbitMQ ServerSpinUp Queue...");

            var factory = new ConnectionFactory()
            {
                HostName = _rabbitMQOptions.Value.RabbitMQHostName,
                Port = _rabbitMQOptions.Value.RabbitMQPort,
                UserName = _rabbitMQOptions.Value.RabbitMQUserName,
                Password = _rabbitMQOptions.Value.RabbitMQPassword,
                DispatchConsumersAsync = true
            };

            // create connection  
            try
            {
                connection = factory.CreateConnection();
            }
            catch (Exception ex)
            {
                Log.Error($"Error connecting to RabbitMQ.  Check that your can access RabbitMQ from your browser by going to: http://host.docker.internal:15672/  Use default username / password: dev / test.  If the page doesn't load check your Windows HOSTs file for the three entries that Docker Desktop is supposed to add on installation.  If the page does load, but you can't login, you probably have another copy of RabbitMQ already running.  Disable your copy of RabbitMQ and try again.  Error message: {ex.Message}");
                return;
            }

            // create channel for server spin up  
            serverSpinUpChannel = connection.CreateModel();

            serverSpinUpQueueNameGUID = Guid.NewGuid();

            serverSpinUpChannel.ExchangeDeclare(exchange: "ows.serverspinup",
                            type: "direct",
                            durable: false,
                            autoDelete: false);

            serverSpinUpChannel.QueueDeclare(queue: serverSpinUpQueueNameGUID.ToString(),
                                         durable: false,
                                         exclusive: true,
                                         autoDelete: true,
                                         arguments: null);
            serverSpinUpChannel.QueueBind(serverSpinUpQueueNameGUID.ToString(), "ows.serverspinup", String.Format("ows.serverspinup.{0}", _worldServerId));
            serverSpinUpChannel.BasicQos(0, 1, false);


            // create channel for server shut down
            serverShutDownChannel = connection.CreateModel();

            serverShutDownQueueNameGUID = Guid.NewGuid();

            serverShutDownChannel.ExchangeDeclare(exchange: "ows.servershutdown",
                            type: "direct",
                            durable: false,
                            autoDelete: false);

            serverShutDownChannel.QueueDeclare(queue: serverShutDownQueueNameGUID.ToString(),
                                         durable: false,
                                         exclusive: true,
                                         autoDelete: true,
                                         arguments: null);
            serverShutDownChannel.QueueBind(serverShutDownQueueNameGUID.ToString(), "ows.servershutdown", String.Format("ows.servershutdown.{0}", _worldServerId));
            serverShutDownChannel.BasicQos(0, 1, false);


            connection.ConnectionShutdown += RabbitMQ_ConnectionShutdown;

            Log.Information("Registered OWS Instance Launcher with RabbitMQ ServerSpinUp Queue Success!");
        }

        //protected override Task ExecuteAsync(CancellationToken stoppingToken)
        public void DoWork()
        {
            //This will be null if there was a problem with initialization in the constructor
            if (_owsInstanceLauncherOptions == null)
            {
                return;
            }

            //Server Spin Up
            var serverSpinUpConsumer = new AsyncEventingBasicConsumer(serverSpinUpChannel);

            serverSpinUpConsumer.Received += (model, ea) =>
            {
                try
                {
                    var body = ea.Body;
                    MQSpinUpServerMessage serverSpinUpMessage = MQSpinUpServerMessage.Deserialize(body.ToArray());
                    Log.Information($"Server Spin Up Message Received: {serverSpinUpMessage.CustomerGUID} WorldServerID: {serverSpinUpMessage.WorldServerID} ZoneInstanceID: {serverSpinUpMessage.ZoneInstanceID} MapName: {serverSpinUpMessage.MapName} Port: {serverSpinUpMessage.Port}");
                    HandleServerSpinUpMessage(
                        serverSpinUpMessage.CustomerGUID,
                        serverSpinUpMessage.WorldServerID,
                        serverSpinUpMessage.ZoneInstanceID,
                        serverSpinUpMessage.MapName,
                        serverSpinUpMessage.Port);

                    serverSpinUpChannel.BasicAck(ea.DeliveryTag, multiple: false);
                }
                catch (Exception ex)
                {
                    Log.Error(ex, "Failed to process server spin-up message");
                    serverSpinUpChannel.BasicNack(ea.DeliveryTag, multiple: false, requeue: true);
                }

                return Task.CompletedTask;
            };

            serverSpinUpConsumer.Shutdown += OnServerSpinUpConsumerShutdown;
            serverSpinUpConsumer.Registered += OnServerSpinUpConsumerRegistered;
            serverSpinUpConsumer.Unregistered += OnServerSpinUpConsumerUnregistered;
            serverSpinUpConsumer.ConsumerCancelled += OnServerSpinUpConsumerConsumerCancelled;

            serverSpinUpChannel.BasicConsume(queue: serverSpinUpQueueNameGUID.ToString(),
                                         autoAck: false,
                                         consumer: serverSpinUpConsumer);

            //Server Shut Down
            var serverShutDownConsumer = new AsyncEventingBasicConsumer(serverShutDownChannel);

            serverShutDownConsumer.Received += (model, ea) =>
            {
                try
                {
                    Log.Information("Server Shut Down Message Received");
                    var body = ea.Body;
                    MQShutDownServerMessage serverShutDownMessage = MQShutDownServerMessage.Deserialize(body.ToArray());
                    HandleServerShutDownMessage(
                        serverShutDownMessage.CustomerGUID,
                        serverShutDownMessage.ZoneInstanceID
                    );

                    serverShutDownChannel.BasicAck(ea.DeliveryTag, multiple: false);
                }
                catch (Exception ex)
                {
                    Log.Error(ex, "Failed to process server shut-down message");
                    serverShutDownChannel.BasicNack(ea.DeliveryTag, multiple: false, requeue: true);
                }

                return Task.CompletedTask;
            };

            serverShutDownConsumer.Shutdown += OnServerShutDownConsumerShutdown;
            serverShutDownConsumer.Registered += OnServerShutDownConsumerRegistered;
            serverShutDownConsumer.Unregistered += OnServerShutDownConsumerUnregistered;
            serverShutDownConsumer.ConsumerCancelled += OnServerShutDownConsumerConsumerCancelled;

            serverShutDownChannel.BasicConsume(queue: serverShutDownQueueNameGUID.ToString(),
                                         autoAck: false,
                                         consumer: serverShutDownConsumer);

            //return Task.CompletedTask;
        }

        private void HandleServerSpinUpMessage(Guid customerGUID, int worldServerID, int zoneInstanceID, string mapName, int port)
        {
            Log.Information($"Starting up {customerGUID} : {worldServerID} : {mapName} : {port}");

            //Security Check on CustomerGUID
            if (_customerGUID != customerGUID)
            {
                Log.Error("HandleServerSpinUpMessage - Incoming CustomerGUID does not match OWSAPIKey in appsettings.json");
                return;
            }

            // Allocate a GameServer from Agones Fleet
            var allocationTask = _agonesAllocator.AllocateAsync(mapName, zoneInstanceID);
            var allocation = allocationTask.GetAwaiter().GetResult();

            if (allocation == null)
            {
                Log.Error($"Failed to allocate GameServer for map {mapName} zone {zoneInstanceID}. No servers available in fleet.");
                return;
            }

            // Track the GameServer name for shutdown
            _zoneToGameServer[zoneInstanceID] = allocation.GameServerName;

            _zoneServerProcessesRepository.AddZoneServerProcess(new ZoneServerProcess
            {
                ZoneInstanceId = zoneInstanceID,
                MapName = mapName,
                Port = allocation.Port,
                ProcessId = 0, // No OS process — Agones manages the pod
                ProcessName = allocation.GameServerName
            });

            Log.Information($"{customerGUID} : {worldServerID} : {mapName} : {allocation.Port} allocated via Agones. GameServer: {allocation.GameServerName} at {allocation.Address}:{allocation.Port}");
        }

        private void HandleServerShutDownMessage(Guid customerGUID, int zoneInstanceID)
        {
            Log.Information($"Shutting down {customerGUID} : {zoneInstanceID}");

            //Security Check on CustomerGUID
            if (_customerGUID != customerGUID)
            {
                Log.Error("HandleServerShutDownMessage - Incoming CustomerGUID does not match OWSAPIKey in appsettings.json");
                return;
            }

            if (_zoneToGameServer.TryGetValue(zoneInstanceID, out var gameServerName))
            {
                var result = _agonesAllocator.DeallocateAsync(gameServerName).GetAwaiter().GetResult();
                if (result)
                {
                    _zoneToGameServer.Remove(zoneInstanceID);
                    Log.Information($"Deallocated GameServer {gameServerName} for zone {zoneInstanceID}");
                }
            }
            else
            {
                Log.Warning($"No tracked GameServer for zone {zoneInstanceID} — may have already been cleaned up");
            }
        }

        private void ShutDownAllZoneServerInstances()
        {
            Log.Information("Shutting down all Server Instances via Agones...");

            foreach (var kvp in _zoneToGameServer)
            {
                _agonesAllocator.DeallocateAsync(kvp.Value).GetAwaiter().GetResult();
                Log.Information($"Deallocated GameServer {kvp.Value} for zone {kvp.Key}");
            }
            _zoneToGameServer.Clear();
        }

        private int RegisterInstanceLauncherRequest()
        {
            try
            {
                var instanceManagementHttpClient = _httpClientFactory.CreateClient("OWSInstanceManagement");

                var RegisterLauncherPayload = new
                {
                    request = new RegisterInstanceLauncherRequestPayload
                    {
                        launcherGUID = _launcherGUID.ToString(),
                        ServerIP = _serverIP,
                        MaxNumberOfInstances = _MaxNumberOfInstances,
                        InternalServerIP = _InternalServerIP,
                        StartingInstancePort = _StartingInstancePort
                    }
                };

                var RegisterLauncherPayloadRequest = new StringContent(JsonSerializer.Serialize(RegisterLauncherPayload), Encoding.UTF8, "application/json");

                var responseMessageAsync = instanceManagementHttpClient.PostAsync("api/Instance/RegisterLauncher", RegisterLauncherPayloadRequest);
                var responseMessage = responseMessageAsync.Result;
                var responseContentAsync = responseMessage.Content.ReadAsStringAsync();

                if (responseMessage == null)
                {
                    return -1;
                }

                if (!responseMessage.IsSuccessStatusCode)
                {
                    return -1;
                }

                return 1;
            }

            catch (Exception ex)
            {
                Log.Error($"Error connecting to Instance Management API: {ex.Message} - {ex.InnerException}");
            }

            return -1;
        }

        private int StartInstanceLauncherRequest()
        {
            try
            {
                var instanceManagementHttpClient = _httpClientFactory.CreateClient("OWSInstanceManagement");

                var request = new HttpRequestMessage()
                {
                    RequestUri = new Uri(instanceManagementHttpClient.BaseAddress + "api/Instance/StartInstanceLauncher"),
                    Method = HttpMethod.Get
                };
                request.Headers.Add("X-LauncherGUID", _launcherGUID.ToString());
                var responseMessageAsync = instanceManagementHttpClient.SendAsync(request);
                var responseMessage = responseMessageAsync.Result;

                if (responseMessage == null)
                {
                    return -1;
                }

                if (!responseMessage.IsSuccessStatusCode)
                {
                    return -1;
                }

                var responseContentAsync = responseMessage.Content.ReadAsStringAsync();
                string responseContentString = responseContentAsync.Result;

                int worldServerID = -1;
                if (Int32.TryParse(responseContentString, out worldServerID))
                {
                    return worldServerID;
                }
            }
            catch (Exception ex)
            {
                Log.Error($"Error connecting to Instance Management API: {ex.Message} - {ex.InnerException}");
            }

            return -1;
        }

        private async Task ShutDownInstanceLauncherRequest(int worldServerId)
        {
            var instanceManagementHttpClient = _httpClientFactory.CreateClient("OWSInstanceManagement");

            var worldServerIDRequestPayload = new
            {
                request = new WorldServerIDRequestPayload
                {
                    WorldServerID = worldServerId
                }
            };

            var shutDownInstanceLauncherRequest = new StringContent(JsonSerializer.Serialize(worldServerIDRequestPayload), Encoding.UTF8, "application/json");

            var request = new HttpRequestMessage()
            {
                RequestUri = new Uri(instanceManagementHttpClient.BaseAddress + "api/Instance/ShutDownInstanceLauncher"),
                Method = HttpMethod.Post,
                Content = shutDownInstanceLauncherRequest
            };
            request.Headers.Add("X-LauncherGUID", _launcherGUID.ToString());

            var responseMessage = await instanceManagementHttpClient.SendAsync(request);

            return;
        }

        private async Task UpdateZoneServerStatusReady(int zoneInstanceID)
        {
            var instanceManagementHttpClient = _httpClientFactory.CreateClient("OWSInstanceManagement");

            var setZoneInstanceStatusRequestPayload = new
            {
                request = new SetZoneInstanceStatusRequestPayload
                {
                    ZoneInstanceID = zoneInstanceID,
                    InstanceStatus = 2 //Ready
                }
            };

            var setZoneInstanceStatusRequest = new StringContent(JsonSerializer.Serialize(setZoneInstanceStatusRequestPayload), Encoding.UTF8, "application/json");

            var responseMessage = await instanceManagementHttpClient.PostAsync("api/Instance/SetZoneInstanceStatus", setZoneInstanceStatusRequest);

            return;
        }

        private Task OnServerSpinUpConsumerConsumerCancelled(object sender, ConsumerEventArgs e) { return Task.CompletedTask; }
        private Task OnServerSpinUpConsumerUnregistered(object sender, ConsumerEventArgs e) { return Task.CompletedTask; }
        private Task OnServerSpinUpConsumerRegistered(object sender, ConsumerEventArgs e) { return Task.CompletedTask; }
        private Task OnServerSpinUpConsumerShutdown(object sender, ShutdownEventArgs e) { return Task.CompletedTask; }

        private Task OnServerShutDownConsumerConsumerCancelled(object sender, ConsumerEventArgs e) { return Task.CompletedTask; }
        private Task OnServerShutDownConsumerUnregistered(object sender, ConsumerEventArgs e) { return Task.CompletedTask; }
        private Task OnServerShutDownConsumerRegistered(object sender, ConsumerEventArgs e) { return Task.CompletedTask; }
        private Task OnServerShutDownConsumerShutdown(object sender, ShutdownEventArgs e) { return Task.CompletedTask; }


        private void RabbitMQ_ConnectionShutdown(object sender, ShutdownEventArgs e) { }

        public void Dispose()
        {
            Log.Information("Shutting Down OWS Instance Launcher...");

            if (_worldServerId > 0)
            {
                var shutDownTask = ShutDownInstanceLauncherRequest(_worldServerId);

                shutDownTask.Wait();

                ShutDownAllZoneServerInstances();
            }

            if (serverSpinUpChannel != null)
            {
                serverSpinUpChannel.Close();
            }
            if (serverShutDownChannel != null)
            {
                serverShutDownChannel.Close();
            }
            if (connection != null)
            {
                connection.Close();
            }

            _agonesAllocator?.Dispose();

            Log.Information("Done!");
        }
    }
}
