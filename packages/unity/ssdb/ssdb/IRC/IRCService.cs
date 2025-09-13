using UnityEngine;
using System;
using System.Collections.Concurrent;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
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
using KBVE.SSDB.Steam;

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
        UniTask<bool> ReconnectAsync(CancellationToken cancellationToken = default);
        void Disconnect();
        void SendMessage(string channel, string message);
        void SendRawCommand(string command);
        void JoinChannel(string channel);
        void LeaveChannel(string channel);
        
        // Message collection access
        IRCMessage[] GetRecentMessages(int count = 50);
        int GetMessageCount();
        IRCMessage GetLatestMessage();
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
        public int port = 6697;
        public bool useSsl = true;
        public string nickname;
        public string username;
        public string realname;
        public string password;
        public string defaultChannel = "#general";
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
            rawMessage = raw;
            timestamp = DateTime.Now;
            var line = raw;

            // Strip IRCv3 tags if present
            if (line.StartsWith("@"))
            {
                var space = line.IndexOf(' ');
                if (space > 0) line = line.Substring(space + 1);
            }

            // IRC message format: [:prefix] <command> [params] [:trailing]
            var parts = line.Split(' ');
            var index = 0;

            // Parse prefix (optional)
            if (line.StartsWith(":"))
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

            // Determine message type - server messages have no !user@host in prefix
            var hasUserHost = !string.IsNullOrEmpty(username) || !string.IsNullOrEmpty(hostname);
            isServerMessage = line.StartsWith(":") && !hasUserHost;

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
        private readonly SteamUserProfiles _steamUserProfiles;

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
        private readonly ObservableQueue<string> outgoingCommands = new();
        private readonly ObservableRingBuffer<IRCMessage> incomingMessages = new();
        private readonly CompositeDisposable _disposables = new();
        private readonly CancellationTokenSource _lifetimeCts = new();
        private CancellationTokenSource _connectionCts;
        private readonly object _connectionLock = new object();
        private const int MaxMessages = 1000;

        // Connection
        private TcpClient tcpClient;
        private Stream connectionStream;
        private StreamReader streamReader;
        private StreamWriter streamWriter;
        private DateTime lastPingReceived = DateTime.Now;
        private volatile bool isRegistered = false;
        private readonly object lastPingLock = new object();

        // Connection state tracking
        private volatile bool isConnecting = false;
        private volatile bool shouldReconnect = false;

        // ... (Keep existing property exposures unchanged)
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
        public IRCService(IRCConfig config, SteamUserProfiles steamUserProfiles = null)
        {
            this.config = config ?? throw new ArgumentNullException(nameof(config));
            this._steamUserProfiles = steamUserProfiles;

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
                
                // Wait for Steam to be ready before connecting IRC
                if (_steamUserProfiles != null)
                {
                    await WaitForSteamReadyAsync(effectiveToken);
                    Operator.D("Steam is ready, configuring IRC with Steam username");
                }
                else
                {
                    Operator.D("No Steam integration, using configured nickname");
                }
                
                // Start message processing loop on main thread
                StartMessageProcessingLoop(effectiveToken).Forget();
                
                // Auto-connect if configured
                if (config.autoReconnect)
                {
                    shouldReconnect = true;
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
        
        private async UniTask WaitForSteamReadyAsync(CancellationToken cancellationToken)
        {
            if (_steamUserProfiles == null) return;
            
            Operator.D("Waiting for Steam username to be available...");
            
            try
            {
                // Use UniTask.WaitUntil with timeout for better async handling
                // Wait for both UserName and UserSteamId to be available
                var steamReadyTask = UniTask.WaitUntil(
                    () => !string.IsNullOrEmpty(_steamUserProfiles.UserName.Value) && 
                          !string.IsNullOrEmpty(_steamUserProfiles.UserSteamId.Value),
                    cancellationToken: cancellationToken
                );
                
                var timeoutTask = UniTask.Delay(TimeSpan.FromSeconds(30), cancellationToken: cancellationToken);
                
                // Wait for either Steam to be ready or timeout
                var completedTaskIndex = await UniTask.WhenAny(steamReadyTask, timeoutTask);
                
                if (completedTaskIndex == 1) // Timeout occurred
                {
                    Operator.D("Timeout waiting for Steam username, proceeding with configured nickname");
                    return;
                }
                
                // Steam is ready, update IRC config with SteamID
                var steamDisplayName = _steamUserProfiles.UserName.Value;
                var steamId = _steamUserProfiles.UserSteamId.Value;
                
                if (!string.IsNullOrEmpty(steamId))
                {
                    // Create IRC nickname using "S" + SteamID format
                    var ircNickname = $"S{steamId}";
                    
                    config.nickname = ircNickname;
                    config.username = ircNickname;
                    config.realname = steamDisplayName; // Keep display name as realname for human readability
                    
                    currentNickname.Value = ircNickname;
                    
                    Operator.D($"Updated IRC config with Steam ID: {ircNickname} (realname: {steamDisplayName})");
                }
                else
                {
                    // Fallback to cleaned display name if SteamID not available
                    var cleanUsername = CleanUsernameForIRC(steamDisplayName);
                    
                    config.nickname = cleanUsername;
                    config.username = cleanUsername;
                    config.realname = steamDisplayName;
                    
                    currentNickname.Value = cleanUsername;
                    
                    Operator.D($"SteamID not available, using cleaned display name: {cleanUsername} (realname: {steamDisplayName})");
                }
            }
            catch (OperationCanceledException)
            {
                Operator.D("Steam wait cancelled, proceeding with configured nickname");
            }
        }
        
        private static string CleanUsernameForIRC(string steamUsername)
        {
            if (string.IsNullOrEmpty(steamUsername))
                return $"GuestAnon{UnityEngine.Random.Range(100000, 999999)}";
            
            // IRC nicknames rules:
            // - Max 30 characters (but often limited to 16 or 9)
            // - Start with letter or special chars: [ ] \ ` _ ^ { | }
            // - Can contain letters, numbers, hyphens, and those special chars
            // - Cannot contain spaces, @, #, :, etc.
            
            var cleaned = steamUsername
                .Replace(" ", "_")           // Spaces to underscores
                .Replace("@", "at")          // @ symbol
                .Replace("#", "hash")        // # symbol
                .Replace(":", "_")           // : symbol
                .Replace("!", "_")           // ! symbol
                .Replace("?", "_")           // ? symbol
                .Replace("*", "_")           // * symbol
                .Replace(",", "_")           // , symbol
                .Replace(".", "_");          // . symbol
            
            // Remove any other non-alphanumeric chars except allowed ones
            cleaned = System.Text.RegularExpressions.Regex.Replace(cleaned, @"[^a-zA-Z0-9_\-\[\]\\`^{|}]", "_");
            
            // Ensure it starts with a letter or allowed special char
            if (cleaned.Length > 0 && !char.IsLetter(cleaned[0]) && !"[]\\`_^{|}".Contains(cleaned[0]))
            {
                cleaned = "Steam_" + cleaned;
            }
            
            // Limit length to 16 characters (common IRC limit)
            if (cleaned.Length > 16)
            {
                cleaned = cleaned.Substring(0, 16);
            }
            
            // Ensure it's not empty
            if (string.IsNullOrEmpty(cleaned))
            {
                cleaned = $"SteamUser{UnityEngine.Random.Range(100, 999)}";
            }
            
            return cleaned;
        }

        public async UniTask<bool> ConnectAsync(CancellationToken cancellationToken = default)
        {
            lock (_connectionLock)
            {
                if (isConnected.Value || isConnecting)
                {
                    Operator.D($"IRC: Already connected or connecting! Connected: {isConnected.Value}, Connecting: {isConnecting}");
                    return isConnected.Value;
                }

                isConnecting = true;
                ValidateConfig();

                // Cancel and cleanup any existing connection tasks first
                _connectionCts?.Cancel();
                CleanupConnection();
                
                _connectionCts = CancellationTokenSource.CreateLinkedTokenSource(_lifetimeCts.Token, cancellationToken);
            }

            // Wait a brief moment for old tasks to cleanup (outside the lock)
            await UniTask.Delay(100, cancellationToken: cancellationToken);

            connectionState.Value = ConnectionState.Connecting;

            try
            {
                var result = await ConnectWithRetryAsync(_connectionCts.Token);
                
                lock (_connectionLock)
                {
                    isConnecting = false;
                }
                
                return result;
            }
            catch (OperationCanceledException)
            {
                lock (_connectionLock)
                {
                    isConnecting = false;
                }
                connectionState.Value = ConnectionState.Disconnected;
                return false;
            }
            catch (Exception ex)
            {
                lock (_connectionLock)
                {
                    isConnecting = false;
                }
                connectionState.Value = ConnectionState.Error;
                errorSubject.OnNext($"Connection failed: {ex.Message}");
                return false;
            }
        }

        public void Disconnect()
        {
            lock (_connectionLock)
            {
                shouldReconnect = false;
                
                // Cancel all connection-related async operations
                _connectionCts?.Cancel();
                
                // Reset all connection state
                connectionState.Value = ConnectionState.Disconnected;
                isConnected.Value = false;
                isRegistered = false;
                isConnecting = false;
                
                // Clean up connection resources
                CleanupConnection();
                
                // Clear queues
                lock (outgoingCommands.SyncRoot)
                {
                    outgoingCommands.Clear();
                }
                
                lock (incomingMessages.SyncRoot)
                {
                    incomingMessages.Clear();
                    pendingMessages.Value = 0;
                }
            }
        }

        public async UniTask<bool> ReconnectAsync(CancellationToken cancellationToken = default)
        {
            try
            {
                Debug.Log("[IRCService] Starting reconnection process...");
                
                lock (_connectionLock)
                {
                    // If already connected, gracefully disconnect first
                    if (isConnected.Value)
                    {
                        Debug.Log("[IRCService] Disconnecting before reconnection...");
                        
                        // Cancel current connection operations
                        _connectionCts?.Cancel();
                        
                        // Clean up connection resources
                        CleanupConnection();
                        
                        // Reset connection state but KEEP shouldReconnect as true
                        connectionState.Value = ConnectionState.Disconnected;
                        isConnected.Value = false;
                        isRegistered = false;
                        isConnecting = false;
                        
                        // Clear queues
                        lock (outgoingCommands.SyncRoot)
                        {
                            outgoingCommands.Clear();
                        }
                        
                        lock (incomingMessages.SyncRoot)
                        {
                            incomingMessages.Clear();
                            pendingMessages.Value = 0;
                        }
                    }
                    
                    // Ensure reconnection is enabled
                    shouldReconnect = true;
                }
                
                // Wait a moment for cleanup to complete
                await UniTask.Delay(1000, cancellationToken: cancellationToken);
                
                // Now attempt to connect
                Debug.Log("[IRCService] Attempting to reconnect...");
                var result = await ConnectAsync(cancellationToken);
                
                if (result)
                {
                    Debug.Log("[IRCService] Reconnection successful");
                }
                else
                {
                    Debug.LogWarning("[IRCService] Reconnection failed");
                }
                
                return result;
            }
            catch (OperationCanceledException)
            {
                Debug.Log("[IRCService] Reconnection cancelled");
                return false;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[IRCService] Reconnection error: {ex.Message}");
                errorSubject.OnNext($"Reconnection failed: {ex.Message}");
                return false;
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
        
        #region Message Collection Access
        
        /// <summary>
        /// Get recent messages from the collection
        /// </summary>
        public IRCMessage[] GetRecentMessages(int count = 50)
        {
            lock (incomingMessages.SyncRoot)
            {
                if (incomingMessages.Count == 0)
                    return new IRCMessage[0];
                
                // Get the most recent messages up to the specified count
                var messagesToTake = Math.Min(count, incomingMessages.Count);
                var messages = new IRCMessage[messagesToTake];
                
                // Copy from the end of the buffer (most recent)
                for (int i = 0; i < messagesToTake; i++)
                {
                    var index = incomingMessages.Count - messagesToTake + i;
                    messages[i] = incomingMessages[index];
                }
                
                return messages;
            }
        }
        
        /// <summary>
        /// Get total count of messages in the buffer
        /// </summary>
        public int GetMessageCount()
        {
            lock (incomingMessages.SyncRoot)
            {
                return incomingMessages.Count;
            }
        }
        
        /// <summary>
        /// Get the latest (most recent) message
        /// </summary>
        public IRCMessage GetLatestMessage()
        {
            lock (incomingMessages.SyncRoot)
            {
                if (incomingMessages.Count == 0)
                    return null;
                
                return incomingMessages[incomingMessages.Count - 1];
            }
        }
        
        #endregion

        private void ValidateConfig()
        {
            if (string.IsNullOrEmpty(config.nickname))
            {
                config.nickname = $"GuestAnon{UnityEngine.Random.Range(100000, 999999)}";
                Operator.D($"IRC: No nickname configured, using fallback: {config.nickname}");
            }

            if (string.IsNullOrEmpty(config.username))
            {
                config.username = config.nickname;
                Operator.D($"IRC: No username configured, using nickname: {config.username}");
            }

            if (string.IsNullOrEmpty(config.realname))
            {
                config.realname = config.nickname;
                Operator.D($"IRC: No realname configured, using nickname: {config.realname}");
            }

            if (string.IsNullOrEmpty(config.server))
            {
                throw new InvalidOperationException("Server must be configured!");
            }

            // Update current nickname tracking
            currentNickname.Value = config.nickname;
        }

        private async UniTask<bool> ConnectWithRetryAsync(CancellationToken cancellationToken)
        {
            int attemptCount = 0;
            
            while (!cancellationToken.IsCancellationRequested && shouldReconnect)
            {
                attemptCount++;
                
                try
                {
                    Operator.D($"IRC: Connection attempt #{attemptCount}");
                    
                    await EstablishConnectionAsync(cancellationToken);

                    if (!tcpClient?.Connected == true)
                    {
                        throw new Exception("TCP connection lost after establishment");
                    }
                    
                    Operator.D("IRC: TCP connection established, starting registration and I/O loops...");
                    
                    // Start I/O loops but don't wait for registration here
                    var inputTask = InputLoopAsync(cancellationToken);
                    var outputTask = OutputLoopAsync(cancellationToken);
                    
                    // Wait for either registration success or connection failure
                    var registrationTimeout = TimeSpan.FromSeconds(30); // Give server time to respond
                    var registrationStart = DateTime.Now;
                    
                    while (!cancellationToken.IsCancellationRequested && 
                           tcpClient?.Connected == true && 
                           !isRegistered && 
                           DateTime.Now - registrationStart < registrationTimeout)
                    {
                        await UniTask.Delay(100, cancellationToken: cancellationToken);
                    }
                    
                    if (isRegistered)
                    {
                        Operator.D("IRC: Registration successful, connection established!");
                        
                        // Now wait for disconnection
                        await UniTask.WhenAny(inputTask, outputTask);
                        
                        Operator.D("IRC: Connection lost, I/O loop exited");
                    }
                    else
                    {
                        Operator.D("IRC: Registration failed or timed out");
                        throw new Exception($"Registration failed or timed out after {registrationTimeout.TotalSeconds} seconds");
                    }

                    // If we get here and shouldReconnect is still true, attempt reconnection
                    if (shouldReconnect && config.autoReconnect && !cancellationToken.IsCancellationRequested)
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
                    errorSubject.OnNext($"Connection error (attempt #{attemptCount}): {ex.Message}");
                    Operator.D($"IRC: Connection attempt #{attemptCount} failed: {ex.Message}");

                    CleanupConnection();

                    if (!config.autoReconnect || !shouldReconnect) 
                    {
                        throw;
                    }

                    connectionState.Value = ConnectionState.Reconnecting;
                    var delayMs = Math.Min(config.reconnectDelayMs * attemptCount, 30000); // Exponential backoff, max 30s
                    Operator.D($"IRC: Retrying in {delayMs}ms...");
                    await UniTask.Delay(delayMs, cancellationToken: cancellationToken);
                }
            }
            
            return isConnected.Value;
        }

        private async UniTask EstablishConnectionAsync(CancellationToken cancellationToken)
        {
            Operator.D($"IRC: Connecting to {config.server}:{config.port} (SSL: {config.useSsl})...");

            // Clean up any existing connection first
            CleanupConnection();

            tcpClient = new TcpClient();
            
            // Set socket options for better connection handling
            tcpClient.NoDelay = true;
            tcpClient.ReceiveTimeout = 30000; // 30 second receive timeout
            tcpClient.SendTimeout = 10000;    // 10 second send timeout
            
            // Use ConnectAsync with timeout
            var connectTask = tcpClient.ConnectAsync(config.server, config.port).AsUniTask();
            var timeoutTask = UniTask.Delay(15000, cancellationToken: cancellationToken); // 15 second connect timeout
            
            var winArgumentIndex = await UniTask.WhenAny(connectTask, timeoutTask);
            
            if (winArgumentIndex == 1) // timeout won
            {
                tcpClient?.Close();
                throw new TimeoutException($"Connection to {config.server}:{config.port} timed out after 15 seconds");
            }

            if (!tcpClient.Connected)
            {
                throw new Exception($"Failed to establish TCP connection to {config.server}:{config.port}");
            }

            Operator.D($"IRC: TCP connected to {config.server}:{config.port}");

            // Set up the stream (SSL or plain)
            try
            {
                if (config.useSsl)
                {
                    var sslStream = new SslStream(tcpClient.GetStream(), false, ValidateServerCertificate, null);
                    
                    // Use timeout for SSL authentication too
                    var sslTask = sslStream.AuthenticateAsClientAsync(config.server).AsUniTask();
                    var sslTimeoutTask = UniTask.Delay(10000, cancellationToken: cancellationToken);
                    
                    var sslWinArgumentIndex = await UniTask.WhenAny(sslTask, sslTimeoutTask);
                    
                    if (sslWinArgumentIndex == 1) // timeout
                    {
                        sslStream?.Close();
                        throw new TimeoutException("SSL authentication timed out after 10 seconds");
                    }
                    
                    connectionStream = sslStream;
                    Operator.D("IRC: SSL connection established");
                }
                else
                {
                    connectionStream = tcpClient.GetStream();
                    Operator.D("IRC: Plain TCP connection established");
                }

                streamReader = new StreamReader(connectionStream, new System.Text.UTF8Encoding(false));
                streamWriter = new StreamWriter(connectionStream, new System.Text.UTF8Encoding(false)) 
                { 
                    AutoFlush = true, 
                    NewLine = "\r\n"
                };
                
                Operator.D($"IRC: Stream setup complete - CanRead: {connectionStream.CanRead}, CanWrite: {connectionStream.CanWrite}");

                // Send IRC registration commands with proper timing
                await SendRegistrationSequenceAsync(cancellationToken);
                
                // Reset registration state
                isRegistered = false;
                
                lock (lastPingLock)
                {
                    lastPingReceived = DateTime.Now;
                }

                Operator.D("IRC: Registration sequence sent, waiting for server response...");
            }
            catch (Exception ex)
            {
                CleanupConnection();
                throw new Exception($"Failed to establish secure connection: {ex.Message}", ex);
            }
        }

        private async UniTask SendRegistrationSequenceAsync(CancellationToken cancellationToken)
        {
            try
            {
                // 1) Send PASS if configured (must be first)
                if (!string.IsNullOrEmpty(config.password))
                {
                    var passCmd = $"PASS {config.password}";
                    Operator.D($"IRC: Sending: {passCmd}");
                    await streamWriter.WriteLineAsync(passCmd);
                    await streamWriter.FlushAsync();
                    await UniTask.Delay(100, cancellationToken: cancellationToken);
                }

                // 2) Send NICK
                var nickCmd = $"NICK {config.nickname}";
                Operator.D($"IRC: Sending: {nickCmd}");
                await streamWriter.WriteLineAsync(nickCmd);
                await streamWriter.FlushAsync();
                await UniTask.Delay(100, cancellationToken: cancellationToken);
                
                // 3) Send USER
                var userCmd = $"USER {config.username ?? config.nickname} 0 * :{config.realname ?? config.nickname}";
                Operator.D($"IRC: Sending: {userCmd}");
                await streamWriter.WriteLineAsync(userCmd);
                await streamWriter.FlushAsync();
                
                // Give server a moment to process
                await UniTask.Delay(200, cancellationToken: cancellationToken);

                // Verify connection is still alive after registration
                if (!tcpClient.Connected)
                {
                    throw new Exception("Server closed connection during registration");
                }

                Operator.D("IRC: Registration commands sent successfully");
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to send registration sequence: {ex.Message}", ex);
            }
        }

        private bool ValidateServerCertificate(object sender, X509Certificate certificate, X509Chain chain, SslPolicyErrors sslPolicyErrors)
        {
            if (sslPolicyErrors == SslPolicyErrors.None)
                return true;

            Operator.D($"IRC: SSL certificate validation - Policy errors: {sslPolicyErrors}");
            
            // Log certificate details for debugging
            if (certificate != null)
            {
                Operator.D($"IRC: Certificate Subject: {certificate.Subject}");
                Operator.D($"IRC: Certificate Issuer: {certificate.Issuer}");
            }
            
            // For development/testing, accept certificates with warnings
            // In production, you should validate more strictly
            return true;
        }

        private async UniTask InputLoopAsync(CancellationToken cancellationToken)
        {
            try
            {
                Operator.D("IRC: Input loop started");
                
                // Don't check isConnected.Value here since we need to wait for the 001 message
                while (!cancellationToken.IsCancellationRequested && tcpClient?.Connected == true && connectionStream != null)
                {
                    try
                    {
                        // Use a timeout for ReadLineAsync to avoid infinite blocking
                        var readTask = streamReader.ReadLineAsync().AsUniTask();
                        var timeoutTask = UniTask.Delay(1000, cancellationToken: cancellationToken);
                        
                        var whenAnyResult = await UniTask.WhenAny(readTask, timeoutTask);
                        
                        if (whenAnyResult.result == "1")
                        {
                            // Only check ping timeout if we're actually registered
                            if (isRegistered)
                            {
                                DateTime lastPing;
                                lock (lastPingLock)
                                {
                                    lastPing = lastPingReceived;
                                }
                                
                                if (DateTime.Now - lastPing > TimeSpan.FromMilliseconds(config.pingTimeoutMs))
                                {
                                    throw new Exception("Ping timeout - connection lost");
                                }
                            }
                            continue; // Try again
                        }
                        
                        // readTask completed - get the actual result
                        var receivedLine = await readTask;
                        if (receivedLine == null) 
                        {
                            // Null line indicates connection closed
                            Operator.D("IRC: Server closed connection (received null)");
                            throw new Exception("Server closed connection");
                        }
                        
                        if (receivedLine.Length == 0)
                        {
                            // Empty line - just continue
                            continue;
                        }

                        Operator.D($"IRC Received: {receivedLine}");
                        await ProcessIncomingLineAsync(receivedLine);
                    }
                    catch (System.IO.IOException ioEx)
                    {
                        Operator.D($"IRC: IO Error reading from stream: {ioEx.Message}");
                        throw;
                    }
                }
                
                Operator.D($"IRC: Input loop exiting - Cancelled: {cancellationToken.IsCancellationRequested}, Connected: {tcpClient?.Connected}");
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
                Operator.D("IRC: Output loop started");
                
                // Don't check isConnected.Value here either since we need to send commands before registration
                while (!cancellationToken.IsCancellationRequested && tcpClient?.Connected == true)
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

                        var ircCommand = $"{command}\r\n";
                        await streamWriter.WriteAsync(ircCommand);
                        await streamWriter.FlushAsync();
                        lastSent = DateTime.Now;

                        Operator.D($"IRC Sent: {command}");
                    }
                    else
                    {
                        await UniTask.Delay(100, cancellationToken: cancellationToken);
                    }
                }
                
                Operator.D($"IRC: Output loop exiting - Cancelled: {cancellationToken.IsCancellationRequested}, Connected: {tcpClient?.Connected}");
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

            // Handle PING/PONG with better parsing
            var trimmed = line.StartsWith("@") ? line[(line.IndexOf(' ') + 1)..] : line;
            if (trimmed.StartsWith("PING"))
            {
                lock (lastPingLock)
                {
                    lastPingReceived = DateTime.Now;
                }
                
                // Extract the ping argument more reliably
                var spaceIndex = trimmed.IndexOf(' ');
                var arg = spaceIndex > 0 ? trimmed[(spaceIndex + 1)..].TrimStart(':') : "";
                var pong = string.IsNullOrEmpty(arg) ? "PONG" : $"PONG :{arg}";
                
                lock (outgoingCommands.SyncRoot)
                {
                    outgoingCommands.Enqueue(pong);
                }
                Operator.D($"IRC: Responded to PING with: {pong}");
                return;
            }

            var message = new IRCMessage(line);

            // Handle server numeric responses with better error handling
            if (message.isServerMessage)
            {
                switch (message.command)
                {
                    case "001": // RPL_WELCOME - registration successful
                        isRegistered = true;
                        isConnected.Value = true;
                        connectionState.Value = ConnectionState.Connected;
                        Operator.D("IRC: *** REGISTRATION SUCCESSFUL! *** Welcome message received.");

                        // Join default channel if specified
                        if (!string.IsNullOrEmpty(config.defaultChannel))
                        {
                            await UniTask.Delay(500); // Brief delay before joining
                            JoinChannel(config.defaultChannel);
                        }
                        break;

                    case "002": case "003": case "004": case "005":
                        Operator.D($"IRC: Server info ({message.command}): {message.message}");
                        break;

                    case "375": case "372": case "376": case "422":
                        // MOTD messages
                        Operator.D($"IRC: MOTD ({message.command}): {message.message}");
                        break;

                    case "433": // ERR_NICKNAMEINUSE
                        var newNick = config.nickname + "_";
                        Operator.D($"IRC: Nickname '{config.nickname}' in use, trying '{newNick}'");
                        currentNickname.Value = newNick;
                        config.nickname = newNick;
                        lock (outgoingCommands.SyncRoot)
                        {
                            outgoingCommands.Enqueue($"NICK {newNick}");
                        }
                        break;

                    case "464": // ERR_PASSWDMISMATCH
                        Operator.D("IRC: Password incorrect!");
                        errorSubject.OnNext("Server password incorrect");
                        break;

                    case "465": // ERR_YOUREBANNEDCREEP
                        Operator.D("IRC: Banned from server!");
                        errorSubject.OnNext("Banned from server");
                        break;

                    case "353": // RPL_NAMREPLY
                        Operator.D($"IRC: Channel users: {message.message}");
                        break;

                    case "366": // RPL_ENDOFNAMES
                        Operator.D("IRC: End of channel user list");
                        break;

                    default:
                        if (int.TryParse(message.command, out var numericCode))
                        {
                            if (numericCode >= 400 && numericCode < 600)
                            {
                                // Error message
                                Operator.D($"IRC: Server error {message.command}: {message.message}");
                                errorSubject.OnNext($"Server error {message.command}: {message.message}");
                            }
                        }
                        break;
                }
            }

            // Handle user-originated commands
            switch (message.command)
            {
                case "JOIN":
                    if (string.Equals(message.nickname, currentNickname.Value, StringComparison.OrdinalIgnoreCase))
                    {
                        var joined = message.parameters?.Length > 0 ? message.parameters[0] : 
                                   (!string.IsNullOrEmpty(message.message) && message.message.StartsWith("#") ? message.message : 
                                   message.channel);

                        if (!string.IsNullOrEmpty(joined))
                        {
                            currentChannel.Value = joined;
                            Operator.D($"IRC: Successfully joined {joined}");
                        }
                    }
                    break;

                case "NICK":
                    if (string.Equals(message.nickname, currentNickname.Value, StringComparison.OrdinalIgnoreCase))
                    {
                        var newNick = message.message ?? (message.parameters?.Length > 0 ? message.parameters[0] : null);
                        if (!string.IsNullOrEmpty(newNick))
                        {
                            currentNickname.Value = newNick;
                            config.nickname = newNick;
                            Operator.D($"IRC: Nickname changed to {newNick}");
                        }
                    }
                    break;

                case "ERROR":
                    Operator.D($"IRC: Server ERROR: {message.message}");
                    errorSubject.OnNext($"Server error: {message.message}");
                    break;
            }

            // Queue message for main thread processing
            lock (incomingMessages.SyncRoot)
            {
                incomingMessages.AddLast(message);
                
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
                connectionStream?.Close();
                tcpClient?.Close();
            }
            catch (Exception ex)
            {
                Operator.D($"IRC: Cleanup error: {ex.Message}");
            }
            finally
            {
                streamWriter = null;
                streamReader = null;
                connectionStream = null;
                tcpClient = null;
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
            // Cancel all async operations immediately
            _lifetimeCts?.Cancel();
            _connectionCts?.Cancel();
            
            try
            {
                // Send quit message if connected, with timeout
                if (isConnected.Value && streamWriter != null)
                {
                    using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(1)))
                    {
                        try
                        {
                            SendRawCommand("QUIT :Closing connection");
                            UniTask.Delay(200, cancellationToken: cts.Token).GetAwaiter().GetResult();
                        }
                        catch (OperationCanceledException)
                        {
                            // Timeout - continue with cleanup
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Operator.D($"Error sending QUIT during disposal: {ex.Message}");
            }
            
            // Force cleanup of connection resources
            Disconnect();
            
            // Wait briefly for async tasks to complete cancellation
            try
            {
                using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(1)))
                {
                    UniTask.Delay(100, cancellationToken: cts.Token).GetAwaiter().GetResult();
                }
            }
            catch (OperationCanceledException)
            {
                // Timeout - continue with disposal
            }
            
            // Dispose cancellation tokens
            _connectionCts?.Dispose();
            _lifetimeCts?.Dispose();
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