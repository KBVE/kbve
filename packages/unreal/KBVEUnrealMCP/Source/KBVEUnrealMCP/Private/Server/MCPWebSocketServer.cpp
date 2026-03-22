#include "Server/MCPWebSocketServer.h"
#include "Server/MCPProtocol.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Common/TcpListener.h"
#include "Sockets.h"
#include "SocketSubsystem.h"
#include "HAL/RunnableThread.h"
#include "Async/Async.h"
#include "IPAddress.h"

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

	FIPv4Endpoint Endpoint(FIPv4Address::Any, Port);
	Listener = MakeShared<FTcpListener>(Endpoint);
	Listener->OnConnectionAccepted().BindRaw(this, &FMCPWebSocketServer::OnConnectionAccepted);

	if (!Listener->Init())
	{
		UE_LOG(LogMCPServer, Error, TEXT("Failed to start TCP listener on port %d"), Port);
		Listener.Reset();
		return;
	}

	bShouldRun = true;
	Thread = FRunnableThread::Create(this, TEXT("MCPTCPServer"), 0, TPri_Normal);

	UE_LOG(LogMCPServer, Log, TEXT("MCP TCP server started on port %d"), Port);
}

void FMCPWebSocketServer::StopServer()
{
	bShouldRun = false;

	if (Listener.IsValid())
	{
		Listener->Stop();
	}

	if (Thread)
	{
		Thread->WaitForCompletion();
		delete Thread;
		Thread = nullptr;
	}

	{
		FScopeLock Lock(&ConnectionsLock);
		for (TSharedPtr<FMCPConnection>& Conn : Connections)
		{
			if (Conn->Socket)
			{
				Conn->Socket->Close();
				ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM)->DestroySocket(Conn->Socket);
			}
		}
		Connections.Empty();
	}

	Listener.Reset();

	UE_LOG(LogMCPServer, Log, TEXT("MCP TCP server stopped"));
}

bool FMCPWebSocketServer::Init()
{
	return true;
}

uint32 FMCPWebSocketServer::Run()
{
	while (bShouldRun)
	{
		// Move pending sockets to connections
		{
			FScopeLock Lock(&PendingLock);
			for (FSocket* PendingSocket : PendingSockets)
			{
				TSharedPtr<FMCPConnection> NewConn = MakeShared<FMCPConnection>(PendingSocket);
				PendingSocket->SetNoDelay(true);

				FScopeLock ConnLock(&ConnectionsLock);
				Connections.Add(NewConn);
				UE_LOG(LogMCPServer, Log, TEXT("MCP client connected: %s"), *NewConn->ClientId);
			}
			PendingSockets.Empty();
		}

		ProcessConnections();
		FPlatformProcess::Sleep(0.01f);
	}
	return 0;
}

void FMCPWebSocketServer::Stop()
{
	bShouldRun = false;
}

bool FMCPWebSocketServer::OnConnectionAccepted(FSocket* ClientSocket, const FIPv4Endpoint& Endpoint)
{
	FScopeLock Lock(&PendingLock);
	PendingSockets.Add(ClientSocket);
	return true;
}

void FMCPWebSocketServer::ProcessConnections()
{
	FScopeLock Lock(&ConnectionsLock);

	for (int32 i = Connections.Num() - 1; i >= 0; --i)
	{
		TSharedPtr<FMCPConnection>& Conn = Connections[i];
		if (!Conn->Socket || Conn->Socket->GetConnectionState() != SCS_Connected)
		{
			UE_LOG(LogMCPServer, Log, TEXT("MCP client disconnected: %s"), *Conn->ClientId);
			if (Conn->Socket)
			{
				Conn->Socket->Close();
				ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM)->DestroySocket(Conn->Socket);
			}
			Connections.RemoveAt(i);
			continue;
		}

		uint32 PendingDataSize = 0;
		if (Conn->Socket->HasPendingData(PendingDataSize) && PendingDataSize > 0)
		{
			TArray<uint8> Buffer;
			Buffer.SetNumUninitialized(FMath::Min(PendingDataSize, (uint32)65536));
			int32 BytesRead = 0;

			if (Conn->Socket->Recv(Buffer.GetData(), Buffer.Num(), BytesRead))
			{
				FString Received = FString(BytesRead, UTF8_TO_TCHAR(reinterpret_cast<const char*>(Buffer.GetData())));
				Conn->ReceiveBuffer += Received;

				// Process newline-delimited messages
				int32 NewlineIdx;
				while (Conn->ReceiveBuffer.FindChar(TEXT('\n'), NewlineIdx))
				{
					FString Message = Conn->ReceiveBuffer.Left(NewlineIdx).TrimStartAndEnd();
					Conn->ReceiveBuffer.RightChopInline(NewlineIdx + 1);

					if (!Message.IsEmpty())
					{
						ProcessMessage(Message, Conn);
					}
				}
			}
		}
	}
}

int32 FMCPWebSocketServer::GetConnectionCount() const
{
	FScopeLock Lock(const_cast<FCriticalSection*>(&ConnectionsLock));
	return Connections.Num();
}

void FMCPWebSocketServer::ProcessMessage(const FString& RawMessage, TSharedPtr<FMCPConnection> Connection)
{
	FString Id, Method;
	TSharedPtr<FJsonObject> Params;

	if (!MCPProtocol::ParseRequest(RawMessage, Id, Method, Params))
	{
		FString ErrorResponse = MCPProtocol::FormatResponse(
			TEXT("unknown"), false,
			MCPProtocolHelpers::MakeError(TEXT("PARSE_ERROR"), TEXT("Invalid JSON request")));
		SendToClient(Connection, ErrorResponse);
		return;
	}

	// Handle heartbeat locally on the network thread
	if (Method == TEXT("mcp.ping"))
	{
		TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
		Result->SetStringField(TEXT("status"), TEXT("ok"));
		Result->SetNumberField(TEXT("timestamp"), FPlatformTime::Seconds());
		SendToClient(Connection, MCPProtocol::FormatResponse(Id, true, Result));
		return;
	}

	// Dispatch to handler on GameThread
	TWeakPtr<FMCPConnection> WeakConn = Connection;
	FMCPHandlerRegistry* RegistryPtr = &Registry;
	FMCPWebSocketServer* Self = this;

	AsyncTask(ENamedThreads::GameThread, [RegistryPtr, Method, Params, Id, Self, WeakConn]()
	{
		TSharedPtr<FMCPConnection> Conn = WeakConn.Pin();
		if (!Conn.IsValid())
		{
			return;
		}

		FMCPResponseDelegate OnComplete;
		OnComplete.BindLambda([Self, Conn, Id](bool bSuccess, TSharedPtr<FJsonObject> ResultOrError)
		{
			FString Response = MCPProtocol::FormatResponse(Id, bSuccess, ResultOrError);
			Self->SendToClient(Conn, Response);
		});

		if (!RegistryPtr->Dispatch(Method, Params, OnComplete))
		{
			FString Response = MCPProtocol::FormatResponse(Id, false,
				MCPProtocolHelpers::MakeError(TEXT("METHOD_NOT_FOUND"),
					FString::Printf(TEXT("Unknown method: %s"), *Method)));
			Self->SendToClient(Conn, Response);
		}
	});
}

void FMCPWebSocketServer::SendToClient(TSharedPtr<FMCPConnection> Connection, const FString& Message)
{
	if (!Connection.IsValid() || !Connection->Socket)
	{
		return;
	}

	FString MessageWithNewline = Message + TEXT("\n");
	FTCHARToUTF8 Converter(*MessageWithNewline);
	int32 BytesSent = 0;
	Connection->Socket->Send(reinterpret_cast<const uint8*>(Converter.Get()), Converter.Length(), BytesSent);
}
