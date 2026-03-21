#include "Server/MCPWebSocketServer.h"
#include "Server/MCPProtocol.h"
#include "Registry/MCPHandlerRegistry.h"
#include "IWebSocketServer.h"
#include "IWebSocketNetworkingModule.h"
#include "HAL/RunnableThread.h"
#include "Async/Async.h"

DEFINE_LOG_CATEGORY(LogMCPServer);

FMCPWebSocketServer::FMCPWebSocketServer(FMCPHandlerRegistry& InRegistry, int32 InPort)
	: Registry(InRegistry)
	, Port(InPort)
{
}

FMCPWebSocketServer::~FMCPWebSocketServer()
{
	StopServer();
}

void FMCPWebSocketServer::StartServer()
{
	if (Thread)
	{
		return;
	}

	FWebSocketClientConnectedCallBack ConnectedCallback;
	ConnectedCallback.BindRaw(this, &FMCPWebSocketServer::OnClientConnected);

	IWebSocketServer* RawServer = FModuleManager::Get().IsModuleLoaded(TEXT("WebSockets"))
		? FModuleManager::Get().LoadModuleChecked<IWebSocketNetworkingModule>(TEXT("WebSockets")).CreateServer(Port, ConnectedCallback)
		: nullptr;

	if (!RawServer)
	{
		UE_LOG(LogMCPServer, Error, TEXT("Failed to create WebSocket server on port %d"), Port);
		return;
	}

	WebSocketServer = TSharedPtr<IWebSocketServer>(RawServer);
	bShouldRun = true;
	Thread = FRunnableThread::Create(this, TEXT("MCPWebSocketServer"), 0, TPri_Normal);

	UE_LOG(LogMCPServer, Log, TEXT("MCP WebSocket server started on port %d"), Port);
}

void FMCPWebSocketServer::StopServer()
{
	bShouldRun = false;

	if (Thread)
	{
		Thread->WaitForCompletion();
		delete Thread;
		Thread = nullptr;
	}

	{
		FScopeLock Lock(&ConnectionsLock);
		Connections.Empty();
	}

	WebSocketServer.Reset();

	UE_LOG(LogMCPServer, Log, TEXT("MCP WebSocket server stopped"));
}

bool FMCPWebSocketServer::Init()
{
	return true;
}

uint32 FMCPWebSocketServer::Run()
{
	while (bShouldRun)
	{
		if (WebSocketServer.IsValid())
		{
			WebSocketServer->Tick();
		}
		FPlatformProcess::Sleep(0.01f);
	}
	return 0;
}

void FMCPWebSocketServer::Stop()
{
	bShouldRun = false;
}

int32 FMCPWebSocketServer::GetConnectionCount() const
{
	FScopeLock Lock(const_cast<FCriticalSection*>(&ConnectionsLock));
	return Connections.Num();
}

void FMCPWebSocketServer::OnClientConnected(INetworkingWebSocket* ClientSocket)
{
	if (!ClientSocket)
	{
		return;
	}

	TSharedPtr<FMCPConnection> Connection = MakeShared<FMCPConnection>(ClientSocket);

	FWebSocketPacketRecievedCallBack ReceiveCallback;
	ReceiveCallback.BindRaw(this, &FMCPWebSocketServer::OnMessage, ClientSocket);
	ClientSocket->SetReceiveCallBack(ReceiveCallback);

	FWebSocketInfoCallBack ClosedCallback;
	ClosedCallback.BindRaw(this, &FMCPWebSocketServer::OnClientDisconnected, ClientSocket);
	ClientSocket->SetSocketClosedCallBack(ClosedCallback);

	{
		FScopeLock Lock(&ConnectionsLock);
		Connections.Add(ClientSocket, Connection);
	}

	UE_LOG(LogMCPServer, Log, TEXT("MCP client connected: %s"), *Connection->ClientId);
}

void FMCPWebSocketServer::OnMessage(void* Data, int32 Count, INetworkingWebSocket* Client)
{
	if (!Data || Count <= 0)
	{
		return;
	}

	TArray<uint8> RawData;
	RawData.Append(static_cast<uint8*>(Data), Count);
	FString Message = FString(UTF8_TO_TCHAR(reinterpret_cast<const char*>(RawData.GetData())));
	Message = Message.Left(Count);

	OnRawMessage(Message, Client);
}

void FMCPWebSocketServer::OnRawMessage(const FString& RawMessage, INetworkingWebSocket* Client)
{
	FString Id, Method;
	TSharedPtr<FJsonObject> Params;

	if (!MCPProtocol::ParseRequest(RawMessage, Id, Method, Params))
	{
		FString ErrorResponse = MCPProtocol::FormatResponse(
			TEXT("unknown"), false,
			MCPProtocolHelpers::MakeError(TEXT("PARSE_ERROR"), TEXT("Invalid JSON request")));
		SendToClient(Client, ErrorResponse);
		return;
	}

	// Handle heartbeat locally
	if (Method == TEXT("mcp.ping"))
	{
		TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
		Result->SetStringField(TEXT("status"), TEXT("ok"));
		Result->SetNumberField(TEXT("timestamp"), FPlatformTime::Seconds());
		SendToClient(Client, MCPProtocol::FormatResponse(Id, true, Result));
		return;
	}

	// Dispatch to handler on GameThread
	TWeakPtr<FMCPConnection> WeakConn;
	{
		FScopeLock Lock(&ConnectionsLock);
		TSharedPtr<FMCPConnection>* Found = Connections.Find(Client);
		if (Found)
		{
			WeakConn = *Found;
		}
	}

	INetworkingWebSocket* ClientCapture = Client;
	FMCPHandlerRegistry* RegistryPtr = &Registry;
	FMCPWebSocketServer* Self = this;

	AsyncTask(ENamedThreads::GameThread, [RegistryPtr, Method, Params, Id, ClientCapture, Self, WeakConn]()
	{
		TSharedPtr<FMCPConnection> Conn = WeakConn.Pin();
		if (!Conn.IsValid())
		{
			return;
		}

		FMCPResponseDelegate OnComplete;
		OnComplete.BindLambda([Self, ClientCapture, Id](bool bSuccess, TSharedPtr<FJsonObject> ResultOrError)
		{
			FString Response = MCPProtocol::FormatResponse(Id, bSuccess, ResultOrError);
			Self->SendToClient(ClientCapture, Response);
		});

		if (!RegistryPtr->Dispatch(Method, Params, OnComplete))
		{
			FString Response = MCPProtocol::FormatResponse(Id, false,
				MCPProtocolHelpers::MakeError(TEXT("METHOD_NOT_FOUND"),
					FString::Printf(TEXT("Unknown method: %s"), *Method)));
			Self->SendToClient(ClientCapture, Response);
		}
	});
}

void FMCPWebSocketServer::OnClientDisconnected(INetworkingWebSocket* Client)
{
	FScopeLock Lock(&ConnectionsLock);
	TSharedPtr<FMCPConnection>* Found = Connections.Find(Client);
	if (Found)
	{
		UE_LOG(LogMCPServer, Log, TEXT("MCP client disconnected: %s"), *(*Found)->ClientId);
		Connections.Remove(Client);
	}
}

void FMCPWebSocketServer::SendToClient(INetworkingWebSocket* Client, const FString& Message)
{
	if (!Client)
	{
		return;
	}

	FTCHARToUTF8 Converter(*Message);
	FScopeLock Lock(&ConnectionsLock);
	if (Connections.Contains(Client))
	{
		Client->Send(reinterpret_cast<const uint8*>(Converter.Get()), Converter.Length(), false);
	}
}
