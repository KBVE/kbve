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
        public int port = 6697;
        public bool useSsl = true;
        public string nickname;
        public string username;
        public string realname;
        public string password; // Optional server password
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
        private Stream connectionStream; // Can be NetworkStream or SslStream
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
                // Set a fallback nickname if none is configured
                config.nickname = $"Guest Anon{UnityEngine.Random.Range(100000000, 999999999)}";
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
        }

        private async UniTask ConnectWithRetryAsync(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    await EstablishConnectionAsync(cancellationToken);

                    Operator.D("IRC: TCP connection established, starting background tasks...");
                    
                    // Verify connection is still valid before starting loops
                    if (tcpClient?.Connected != true)
                    {
                        throw new Exception("TCP connection lost after establishment");
                    }
                    
                    // Always start background tasks after TCP connection
                    var inputTask = InputLoopAsync(cancellationToken);
                    var outputTask = OutputLoopAsync(cancellationToken);

                    Operator.D("IRC: Background tasks started, waiting for completion...");

                    // Wait for disconnection or both tasks to complete
                    var completedTaskIndex = await UniTask.WhenAny(inputTask, outputTask);
                    
                    Operator.D($"IRC: Task {completedTaskIndex} completed first, cleaning up...");

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
            Operator.D($"IRC: Connecting to {config.server}:{config.port} (SSL: {config.useSsl})...");

            tcpClient = new TcpClient();
            tcpClient.NoDelay = true; // Disable Nagle's algorithm for faster response
            await tcpClient.ConnectAsync(config.server, config.port).AsUniTask();

            if (!tcpClient.Connected)
                throw new Exception("Failed to establish TCP connection");

            // Set up the stream (SSL or plain)
            if (config.useSsl)
            {
                var sslStream = new SslStream(tcpClient.GetStream(), false, ValidateServerCertificate, null);
                await sslStream.AuthenticateAsClientAsync(config.server).AsUniTask();
                connectionStream = sslStream;
                Operator.D("IRC: SSL connection established");
            }
            else
            {
                connectionStream = tcpClient.GetStream();
                Operator.D("IRC: Plain TCP connection established");
            }

            streamReader = new StreamReader(connectionStream, System.Text.Encoding.UTF8);
            streamWriter = new StreamWriter(connectionStream, System.Text.Encoding.UTF8) 
            { 
                AutoFlush = true, 
                NewLine = "\r\n" // Explicit IRC line endings
            };
            
            // Test if we can immediately read from the stream
            Operator.D($"IRC: Stream - CanRead: {connectionStream.CanRead}, CanWrite: {connectionStream.CanWrite}");

            // Send IRC registration with proper order and timing
            // 1) PASS (if configured) - must be first
            if (!string.IsNullOrEmpty(config.password))
            {
                Operator.D($"IRC: Sending: PASS {config.password}");
                await streamWriter.WriteAsync($"PASS {config.password}\r\n");
                await streamWriter.FlushAsync();
                await UniTask.Delay(50);
            }

            // 2) CAP LS (optional capability negotiation)
            Operator.D("IRC: Sending: CAP LS 302");
            await streamWriter.WriteAsync("CAP LS 302\r\n");
            await streamWriter.FlushAsync();
            await UniTask.Delay(50);

            // 3) NICK / USER registration
            Operator.D($"IRC: Sending: NICK {config.nickname}");
            await streamWriter.WriteAsync($"NICK {config.nickname}\r\n");
            await streamWriter.FlushAsync();
            await UniTask.Delay(50);
            
            Operator.D($"IRC: Sending: USER {config.username ?? config.nickname} 0 * :{config.realname ?? config.nickname}");
            await streamWriter.WriteAsync($"USER {config.username ?? config.nickname} 0 * :{config.realname ?? config.nickname}\r\n");
            await streamWriter.FlushAsync();

            // 4) End CAP negotiation quickly
            await UniTask.Delay(50);
            Operator.D("IRC: Sending: CAP END");
            await streamWriter.WriteAsync("CAP END\r\n");
            await streamWriter.FlushAsync();
            
            // Give the server a brief moment to respond before starting loops
            await UniTask.Delay(100);

            // Check if connection is still alive
            if (!tcpClient.Connected)
            {
                throw new Exception("Server closed connection during registration");
            }

            Operator.D("IRC: Registration complete, connection still active");

            // Don't set isConnected yet - wait for 001 RPL_WELCOME message
            lock (lastPingLock)
            {
                lastPingReceived = DateTime.Now;
            }

            Operator.D("IRC: Registration commands sent, waiting for server welcome...");
        }

        private bool ValidateServerCertificate(object sender, X509Certificate certificate, X509Chain chain, SslPolicyErrors sslPolicyErrors)
        {
            // For development/testing, accept all certificates
            // In production, you should validate the certificate properly
            if (sslPolicyErrors == SslPolicyErrors.None)
                return true;

            Operator.D($"IRC: SSL certificate validation - Policy errors: {sslPolicyErrors}");
            
            // Accept certificate warnings for now (you may want to be more strict in production)
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
                        
                        var index = await UniTask.WhenAny(readTask, timeoutTask);
                        
                        if (index == 1)
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

            // Handle PING/PONG - strip IRCv3 tags first
            var trimmed = line.StartsWith("@") ? line.Substring(line.IndexOf(' ') + 1) : line;
            if (trimmed.StartsWith("PING"))
            {
                lock (lastPingLock)
                {
                    lastPingReceived = DateTime.Now;
                }
                
                // Extract the argument after "PING "
                var arg = trimmed.Length > 4 ? trimmed.Substring(4).TrimStart(' ', ':') : "";
                var pong = string.IsNullOrEmpty(arg) ? "PONG" : $"PONG :{arg}";
                
                lock (outgoingCommands.SyncRoot)
                {
                    outgoingCommands.Enqueue(pong);
                }
                return;
            }

            var message = new IRCMessage(line);

            // Handle server numeric responses
            if (message.isServerMessage)
            {
                switch (message.command)
                {
                    case "001": // RPL_WELCOME - registration successful
                        isRegistered = true;
                        isConnected.Value = true; // Now we're truly connected!
                        connectionState.Value = ConnectionState.Connected;
                        Operator.D("IRC: Registration successful! Welcome message received.");

                        // Join default channel if specified
                        if (!string.IsNullOrEmpty(config.defaultChannel))
                        {
                            JoinChannel(config.defaultChannel);
                        }
                        break;

                    case "002": // RPL_YOURHOST
                        Operator.D($"IRC: Server info: {message.message}");
                        break;

                    case "003": // RPL_CREATED  
                        Operator.D($"IRC: Server created: {message.message}");
                        break;

                    case "004": // RPL_MYINFO
                        Operator.D($"IRC: Server info: {message.message}");
                        break;

                    case "005": // RPL_BOUNCE/ISUPPORT
                        Operator.D($"IRC: Server features: {message.message}");
                        break;

                    case "375": // RPL_MOTDSTART
                        Operator.D("IRC: MOTD Start");
                        break;

                    case "372": // RPL_MOTD
                        Operator.D($"IRC: MOTD: {message.message}");
                        break;

                    case "376": // RPL_ENDOFMOTD
                        Operator.D("IRC: MOTD End");
                        break;

                    case "422": // ERR_NOMOTD
                        Operator.D("IRC: No MOTD");
                        break;

                    case "433": // ERR_NICKNAMEINUSE
                        var newNick = config.nickname + "_";
                        Operator.D($"IRC: Nickname in use, trying {newNick}");
                        currentNickname.Value = newNick;
                        config.nickname = newNick; // Update config too
                        lock (outgoingCommands.SyncRoot)
                        {
                            outgoingCommands.Enqueue($"NICK {newNick}");
                        }
                        break;

                    case "353": // RPL_NAMREPLY (channel user list)
                        Operator.D($"IRC: Users in channel: {message.message}");
                        break;

                    case "366": // RPL_ENDOFNAMES
                        Operator.D("IRC: End of channel user list");
                        break;

                    case "CAP":
                        // Handle capability negotiation responses
                        if (message.parameters != null && message.parameters.Length > 1)
                        {
                            var capCommand = message.parameters[1];
                            Operator.D($"IRC: CAP response: {capCommand} - {message.message}");
                        }
                        break;
                }
            }

            // Handle user-originated commands (not server numerics)
            switch (message.command)
            {
                case "JOIN":
                    if (message.nickname == currentNickname.Value || message.nickname == config.nickname)
                    {
                        // Handle different JOIN formats: :nick JOIN #chan vs :nick JOIN :#chan
                        var joined =
                            (message.parameters != null && message.parameters.Length > 0 ? message.parameters[0] : null)
                            ?? (!string.IsNullOrEmpty(message.message) && message.message.StartsWith("#") ? message.message : null)
                            ?? message.channel; // fallback

                        if (!string.IsNullOrEmpty(joined))
                        {
                            currentChannel.Value = joined;
                            Operator.D($"IRC: Successfully joined {joined}");
                        }
                    }
                    break;
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