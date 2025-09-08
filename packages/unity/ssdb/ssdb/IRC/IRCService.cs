using UnityEngine;
using System;
using System.Collections.Concurrent;
using ObservableCollections;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using System.Text.RegularExpressions;
using Cysharp.Threading.Tasks;
using R3;
using VContainer;
using VContainer.Unity;
using Newtonsoft.Json;
using KBVE.MMExtensions.Orchestrator;

namespace KBVE.SSDB.IRC
{
    public interface IIRCService
    {
        // Observable streams for reactive programming
        Observable<IRCMessage> OnMessageReceived { get; }
        Observable<ConnectionState> OnConnectionStateChanged { get; }
        Observable<string> OnError { get; }
        Observable<string> OnRawMessageReceived { get; }

        // Thread-safe reactive properties (exposed as Observable)
        Observable<bool> IsConnected { get; }
        Observable<int> PendingMessages { get; }
        Observable<string> CurrentChannel { get; }
        Observable<string> CurrentNickname { get; }
        
        // Current values (for immediate access)
        bool IsConnectedValue { get; }
        int PendingMessagesValue { get; }
        string CurrentChannelValue { get; }
        string CurrentNicknameValue { get; }

        // Methods
        UniTask<bool> ConnectAsync(CancellationToken cancellationToken = default);
        void Disconnect();
        void SendMessage(string channel, string message);
        void SendRawCommand(string command);
        void JoinChannel(string channel);
        void LeaveChannel(string channel);
    }

    public enum ConnectionState
    {
        Disconnected,
        Connecting,
        Connected,
        Reconnecting,
        Error
    }

    [Serializable]
    public class IRCConfig
    {
        public string server = "irc.kbve.com";
        public int port = 6667;
        public string nickname;
        public string username;
        public string realname;
        public string password; // Optional server password
        public string defaultChannel;
        public bool autoReconnect = true;
        public int reconnectDelayMs = 5000;
        public int pingTimeoutMs = 60000; // IRC servers typically have longer timeouts
        public int rateLimitMs = 1000; // More lenient for general IRC
    }

    [Serializable]
    public class IRCMessage
    {
        public string nickname;
        public string username;
        public string hostname;
        public string command;
        public string[] parameters;
        public string message;
        public string channel;
        public string rawMessage;
        public DateTime timestamp;
        public bool isPrivateMessage;
        public bool isChannelMessage;
        public bool isServerMessage;

        [JsonConstructor]
        public IRCMessage() { }

        public IRCMessage(string raw)
        {
            rawMessage = raw;
            timestamp = DateTime.Now;
            ParseMessage(raw);
        }

        private void ParseMessage(string raw)
        {
            // IRC message format: [:prefix] <command> [params] [:trailing]
            var parts = raw.Split(' ');
            var index = 0;

            // Parse prefix (optional)
            if (raw.StartsWith(":"))
            {
                var prefix = parts[0].Substring(1); // Remove ':'
                ParsePrefix(prefix);
                index = 1;
            }

            // Parse command
            if (index < parts.Length)
            {
                command = parts[index];
                index++;
            }

            // Parse parameters
            var paramList = new System.Collections.Generic.List<string>();
            for (int i = index; i < parts.Length; i++)
            {
                if (parts[i].StartsWith(":"))
                {
                    // Trailing parameter - join all remaining parts
                    var trailing = string.Join(" ", parts, i, parts.Length - i).Substring(1); // Remove ':'
                    message = trailing;
                    break;
                }
                else
                {
                    paramList.Add(parts[i]);
                }
            }
            parameters = paramList.ToArray();

            // Determine message type
            isServerMessage = string.IsNullOrEmpty(nickname);

            if (command == "PRIVMSG" && parameters.Length > 0)
            {
                channel = parameters[0];
                isChannelMessage = channel.StartsWith("#");
                isPrivateMessage = !isChannelMessage;
            }
        }

        private void ParsePrefix(string prefix)
        {
            // Prefix format: nick[!user][@host]
            var match = Regex.Match(prefix, @"^([^!@]+)(?:!([^@]+))?(?:@(.+))?$");
            if (match.Success)
            {
                nickname = match.Groups[1].Value;
                username = match.Groups[2].Value;
                hostname = match.Groups[3].Value;
            }
        }
    }

    public class IRCService : IIRCService, IAsyncStartable, IDisposable
    {
        private readonly IRCConfig config;

        // R3 Thread-safe Reactive Properties using SynchronizedReactiveProperty
        private readonly SynchronizedReactiveProperty<bool> isConnected = new(false);
        private readonly SynchronizedReactiveProperty<int> pendingMessages = new(0);
        private readonly SynchronizedReactiveProperty<string> currentChannel = new(string.Empty);
        private readonly SynchronizedReactiveProperty<string> currentNickname = new(string.Empty);
        private readonly SynchronizedReactiveProperty<ConnectionState> connectionState = new(ConnectionState.Disconnected);

        // R3 Subjects for events
        private readonly Subject<IRCMessage> messageSubject = new();
        private readonly Subject<string> errorSubject = new();
        private readonly Subject<string> rawMessageSubject = new();

        // Threading
        // Thread-safe observable collections for multi-threaded operations
        private readonly ObservableQueue<string> outgoingCommands = new();
        private readonly ObservableRingBuffer<IRCMessage> incomingMessages = new();
        private readonly CompositeDisposable _disposables = new();
        private readonly CancellationTokenSource _lifetimeCts = new();
        private CancellationTokenSource _connectionCts;
        private readonly object _connectionLock = new object();
        private const int MaxMessages = 1000; // Maximum messages to keep in buffer

        // Connection
        private TcpClient tcpClient;
        private NetworkStream networkStream;
        private StreamReader streamReader;
        private StreamWriter streamWriter;
        private DateTime lastPingReceived = DateTime.Now;
        private volatile bool isRegistered = false;
        private readonly object lastPingLock = new object();

        // Expose as Observable for thread-safe read-only access
        public Observable<bool> IsConnected => isConnected;
        public Observable<int> PendingMessages => pendingMessages;
        public Observable<string> CurrentChannel => currentChannel;
        public Observable<string> CurrentNickname => currentNickname;
        
        // Expose current values for immediate access
        public bool IsConnectedValue => isConnected.Value;
        public int PendingMessagesValue => pendingMessages.Value;
        public string CurrentChannelValue => currentChannel.Value;
        public string CurrentNicknameValue => currentNickname.Value;

        public Observable<IRCMessage> OnMessageReceived => messageSubject.AsObservable();
        public Observable<ConnectionState> OnConnectionStateChanged => connectionState.AsObservable();
        public Observable<string> OnError => errorSubject.AsObservable();
        public Observable<string> OnRawMessageReceived => rawMessageSubject.AsObservable();

        [Inject]
        public IRCService(IRCConfig config)
        {
            this.config = config ?? throw new ArgumentNullException(nameof(config));

            // Set initial values
            currentChannel.Value = config.defaultChannel ?? string.Empty;
            currentNickname.Value = config.nickname ?? string.Empty;
        }

        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            var effectiveToken = CreateEffectiveToken(cancellationToken);
            
            try
            {
                // Guard: Wait for Operator to be ready
                await Operator.R();
                effectiveToken.ThrowIfCancellationRequested();
                
                Operator.D("IRCService starting...");
                
                // Start message processing loop on main thread
                StartMessageProcessingLoop(effectiveToken).Forget();
                
                // Auto-connect if configured
                if (config.autoReconnect)
                {
                    await ConnectAsync(effectiveToken);
                }
                
                Operator.D("IRCService started successfully");
            }
            catch (OperationCanceledException)
            {
                Operator.D("IRCService startup cancelled");
            }
            catch (Exception ex)
            {
                Operator.D($"IRCService startup failed: {ex.Message}");
            }
        }

        public async UniTask<bool> ConnectAsync(CancellationToken cancellationToken = default)
        {
            bool alreadyConnected = false;
            
            lock (_connectionLock)
            {
                if (isConnected.Value)
                {
                    alreadyConnected = true;
                }
                else
                {
                    ValidateConfig();

                    _connectionCts?.Cancel();
                    _connectionCts = CancellationTokenSource.CreateLinkedTokenSource(_lifetimeCts.Token, cancellationToken);
                }
            }

            if (alreadyConnected)
            {
                Operator.D("IRC: Already connected!");
                return true;
            }

            connectionState.Value = ConnectionState.Connecting;

            try
            {
                await ConnectWithRetryAsync(_connectionCts.Token);
                return isConnected.Value;
            }
            catch (OperationCanceledException)
            {
                connectionState.Value = ConnectionState.Disconnected;
                return false;
            }
            catch (Exception ex)
            {
                connectionState.Value = ConnectionState.Error;
                errorSubject.OnNext($"Connection failed: {ex.Message}");
                return false;
            }
        }

        public void Disconnect()
        {
            lock (_connectionLock)
            {
                _connectionCts?.Cancel();
                CleanupConnection();
                connectionState.Value = ConnectionState.Disconnected;
                isConnected.Value = false;
                isRegistered = false;
            }
        }

        public void SendMessage(string channel, string message)
        {
            if (!isConnected.Value)
            {
                Operator.D("IRC: Cannot send message - not connected!");
                return;
            }

            lock (outgoingCommands.SyncRoot)
            {
                outgoingCommands.Enqueue($"PRIVMSG {channel} :{message}");
            }
        }

        public void SendRawCommand(string command)
        {
            if (!isConnected.Value)
            {
                Operator.D("IRC: Cannot send command - not connected!");
                return;
            }

            lock (outgoingCommands.SyncRoot)
            {
                outgoingCommands.Enqueue(command);
            }
        }

        public void JoinChannel(string channel)
        {
            if (!channel.StartsWith("#"))
                channel = "#" + channel;

            SendRawCommand($"JOIN {channel}");
            currentChannel.Value = channel;
        }

        public void LeaveChannel(string channel)
        {
            if (!channel.StartsWith("#"))
                channel = "#" + channel;

            SendRawCommand($"PART {channel}");

            if (currentChannel.Value == channel)
                currentChannel.Value = string.Empty;
        }

        private void ValidateConfig()
        {
            if (string.IsNullOrEmpty(config.nickname))
            {
                throw new InvalidOperationException("Nickname must be configured!");
            }

            if (string.IsNullOrEmpty(config.server))
            {
                throw new InvalidOperationException("Server must be configured!");
            }
        }

        private async UniTask ConnectWithRetryAsync(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    await EstablishConnectionAsync(cancellationToken);

                    if (isConnected.Value)
                    {
                        connectionState.Value = ConnectionState.Connected;

                        // Start background tasks
                        var inputTask = InputLoopAsync(cancellationToken);
                        var outputTask = OutputLoopAsync(cancellationToken);

                        // Wait for disconnection
                        await UniTask.WhenAny(inputTask, outputTask);
                    }

                    if (!cancellationToken.IsCancellationRequested && config.autoReconnect)
                    {
                        connectionState.Value = ConnectionState.Reconnecting;
                        Operator.D($"IRC: Reconnecting in {config.reconnectDelayMs}ms...");
                        await UniTask.Delay(config.reconnectDelayMs, cancellationToken: cancellationToken);
                    }
                    else
                    {
                        break;
                    }
                }
                catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                {
                    errorSubject.OnNext($"Connection error: {ex.Message}");

                    if (!config.autoReconnect) throw;

                    connectionState.Value = ConnectionState.Reconnecting;
                    await UniTask.Delay(config.reconnectDelayMs, cancellationToken: cancellationToken);
                }
            }
        }

        private async UniTask EstablishConnectionAsync(CancellationToken cancellationToken)
        {
            Operator.D($"IRC: Connecting to {config.server}:{config.port}...");

            tcpClient = new TcpClient();
            await tcpClient.ConnectAsync(config.server, config.port).AsUniTask();

            if (!tcpClient.Connected)
                throw new Exception("Failed to establish TCP connection");

            networkStream = tcpClient.GetStream();
            streamReader = new StreamReader(networkStream);
            streamWriter = new StreamWriter(networkStream) { AutoFlush = true };

            // Send IRC registration
            if (!string.IsNullOrEmpty(config.password))
            {
                await streamWriter.WriteLineAsync($"PASS {config.password}");
            }

            await streamWriter.WriteLineAsync($"NICK {config.nickname}");
            await streamWriter.WriteLineAsync($"USER {config.username ?? config.nickname} 0 * :{config.realname ?? config.nickname}");

            isConnected.Value = true;
            lock (lastPingLock)
            {
                lastPingReceived = DateTime.Now;
            }

            Operator.D("IRC: Connected successfully!");
        }

        private async UniTask InputLoopAsync(CancellationToken cancellationToken)
        {
            try
            {
                while (!cancellationToken.IsCancellationRequested && isConnected.Value)
                {
                    if (!networkStream.DataAvailable)
                    {
                        // Check ping timeout
                        DateTime lastPing;
                        lock (lastPingLock)
                        {
                            lastPing = lastPingReceived;
                        }
                        
                        if (DateTime.Now - lastPing > TimeSpan.FromMilliseconds(config.pingTimeoutMs))
                        {
                            throw new Exception("Ping timeout - connection lost");
                        }

                        await UniTask.Delay(100, cancellationToken: cancellationToken);
                        continue;
                    }

                    var line = await streamReader.ReadLineAsync().AsUniTask();
                    if (string.IsNullOrEmpty(line)) continue;

                    await ProcessIncomingLineAsync(line);
                }
            }
            catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
            {
                Operator.D($"IRC Input error: {ex.Message}");
                isConnected.Value = false;
                throw;
            }
        }

        private async UniTask OutputLoopAsync(CancellationToken cancellationToken)
        {
            var lastSent = DateTime.MinValue;

            try
            {
                while (!cancellationToken.IsCancellationRequested && isConnected.Value)
                {
                    string command = null;
                lock (outgoingCommands.SyncRoot)
                {
                    if (outgoingCommands.Count > 0)
                    {
                        command = outgoingCommands.Dequeue();
                    }
                }
                
                if (command != null)
                    {
                        // Rate limiting
                        var timeSinceLastSent = DateTime.Now - lastSent;
                        if (timeSinceLastSent.TotalMilliseconds < config.rateLimitMs)
                        {
                            var delay = config.rateLimitMs - (int)timeSinceLastSent.TotalMilliseconds;
                            await UniTask.Delay(delay, cancellationToken: cancellationToken);
                        }

                        await streamWriter.WriteLineAsync(command);
                        lastSent = DateTime.Now;

                        Operator.D($"IRC Sent: {command}");
                    }
                    else
                    {
                        await UniTask.Delay(100, cancellationToken: cancellationToken);
                    }
                }
            }
            catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
            {
                Operator.D($"IRC Output error: {ex.Message}");
                isConnected.Value = false;
                throw;
            }
        }

        private async UniTask ProcessIncomingLineAsync(string line)
        {
            rawMessageSubject.OnNext(line);

            // Handle PING/PONG
            if (line.StartsWith("PING "))
            {
                lock (lastPingLock)
                {
                    lastPingReceived = DateTime.Now;
                }
                var pongResponse = line.Replace("PING", "PONG");
                lock (outgoingCommands.SyncRoot)
                {
                    outgoingCommands.Enqueue(pongResponse);
                }
                return;
            }

            var message = new IRCMessage(line);

            // Handle server responses
            if (message.isServerMessage)
            {
                switch (message.command)
                {
                    case "001": // RPL_WELCOME - registration successful
                        isRegistered = true;
                        Operator.D("IRC: Registration successful!");

                        // Join default channel if specified
                        if (!string.IsNullOrEmpty(config.defaultChannel))
                        {
                            JoinChannel(config.defaultChannel);
                        }
                        break;

                    case "433": // ERR_NICKNAMEINUSE
                        var newNick = config.nickname + "_";
                        Operator.D($"IRC: Nickname in use, trying {newNick}");
                        currentNickname.Value = newNick;
                        lock (outgoingCommands.SyncRoot)
                        {
                            outgoingCommands.Enqueue($"NICK {newNick}");
                        }
                        break;
                }
            }

            // Queue message for main thread processing (thread-safe)
            lock (incomingMessages.SyncRoot)
            {
                incomingMessages.AddLast(message);
                
                // Manually limit message history size
                while (incomingMessages.Count > MaxMessages)
                {
                    incomingMessages.RemoveFirst();
                }
                
                pendingMessages.Value = incomingMessages.Count;
            }
        }

        private async UniTaskVoid StartMessageProcessingLoop(CancellationToken cancellationToken)
        {
            // Process messages on main thread for Unity compatibility
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    IRCMessage message = null;
                    lock (incomingMessages.SyncRoot)
                    {
                        if (incomingMessages.Count > 0)
                        {
                            // Process and remove the oldest message
                            message = incomingMessages[0];
                            incomingMessages.RemoveFirst();
                        }
                    }
                    
                    if (message != null)
                    {
                        messageSubject.OnNext(message);
                        lock (incomingMessages.SyncRoot)
                        {
                            pendingMessages.Value = incomingMessages.Count;
                        }
                    }

                    await UniTask.Yield(PlayerLoopTiming.Update, cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Operator.D($"Message processing error: {ex.Message}");
                }
            }
        }

        private void CleanupConnection()
        {
            isConnected.Value = false;

            try
            {
                streamWriter?.Close();
                streamReader?.Close();
                networkStream?.Close();
                tcpClient?.Close();
            }
            catch (Exception ex)
            {
                Operator.D($"IRC: Cleanup error: {ex.Message}");
            }
        }

        private CancellationToken CreateEffectiveToken(CancellationToken externalToken)
        {
            if (_lifetimeCts.Token.IsCancellationRequested)
                return _lifetimeCts.Token;
            
            if (!externalToken.CanBeCanceled)
                return _lifetimeCts.Token;
            
            return CancellationTokenSource.CreateLinkedTokenSource(_lifetimeCts.Token, externalToken).Token;
        }

        public void Dispose()
        {
            _lifetimeCts?.Cancel();
            
            try
            {
                // Send quit message if connected
                if (isConnected.Value)
                {
                    using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2)))
                    {
                        SendRawCommand("QUIT :Closing connection");
                        UniTask.Delay(500, cancellationToken: cts.Token).GetAwaiter().GetResult();
                    }
                }
            }
            catch (Exception ex)
            {
                Operator.D($"Error during IRC disposal: {ex.Message}");
            }
            
            Disconnect();
            
            _lifetimeCts?.Dispose();
            _connectionCts?.Dispose();
            _disposables?.Dispose();

            // Dispose R3 resources
            isConnected?.Dispose();
            pendingMessages?.Dispose();
            currentChannel?.Dispose();
            currentNickname?.Dispose();
            connectionState?.Dispose();
            messageSubject?.Dispose();
            errorSubject?.Dispose();
            rawMessageSubject?.Dispose();
        }
    }

    // Example usage component
    public class IRCChatDisplay : MonoBehaviour
    {
        [Inject] private IIRCService ircService;

        private readonly CompositeDisposable disposables = new();

        private void Start()
        {
            // Subscribe to reactive streams
            ircService.OnMessageReceived
                .Where(msg => msg.isChannelMessage || msg.isPrivateMessage)
                .Subscribe(OnChatMessage)
                .AddTo(disposables);

            ircService.OnConnectionStateChanged
                .Subscribe(OnConnectionStateChanged)
                .AddTo(disposables);

            ircService.IsConnected
                .Subscribe(isConnected => Operator.D($"IRC Connected: {isConnected}"))
                .AddTo(disposables);

            ircService.OnRawMessageReceived
                .Subscribe(raw => Operator.D($"IRC Raw: {raw}"))
                .AddTo(disposables);

            // Connect automatically
            ircService.ConnectAsync(this.GetCancellationTokenOnDestroy()).Forget();
        }

        private void OnChatMessage(IRCMessage message)
        {
            Operator.D($"[{message.timestamp:HH:mm:ss}] <{message.nickname}> {message.message}");
        }

        private void OnConnectionStateChanged(ConnectionState state)
        {
            Operator.D($"IRC Connection state: {state}");
        }

        private void OnDestroy()
        {
            disposables.Dispose();
        }
    }
}