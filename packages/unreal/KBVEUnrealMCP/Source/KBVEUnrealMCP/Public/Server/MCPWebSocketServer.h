#pragma once

#include "CoreMinimal.h"
#include "HAL/Runnable.h"
#include "HAL/ThreadSafeBool.h"
#include "Interfaces/IPv4/IPv4Endpoint.h"
#include "Server/MCPConnection.h"

class FMCPHandlerRegistry;
class FTcpListener;
class FSocket;

DECLARE_LOG_CATEGORY_EXTERN(LogMCPServer, Log, All);

class KBVEUNREALMCP_API FMCPWebSocketServer : public FRunnable
{
public:
	FMCPWebSocketServer(FMCPHandlerRegistry& InRegistry, int32 InPort);
	virtual ~FMCPWebSocketServer();

	void StartServer();
	void StopServer();

	int32 GetPort() const { return Port; }
	int32 GetConnectionCount() const;

	// FRunnable
	virtual bool Init() override;
	virtual uint32 Run() override;
	virtual void Stop() override;

private:
	bool OnConnectionAccepted(FSocket* ClientSocket, const FIPv4Endpoint& Endpoint);
	void ProcessConnections();
	void ProcessMessage(const FString& RawMessage, TSharedPtr<FMCPConnection> Connection);

	void SendToClient(TSharedPtr<FMCPConnection> Connection, const FString& Message);

	FMCPHandlerRegistry& Registry;
	int32 Port;

	TSharedPtr<FTcpListener> Listener;
	TArray<TSharedPtr<FMCPConnection>> Connections;
	TArray<FSocket*> PendingSockets;
	FCriticalSection ConnectionsLock;
	FCriticalSection PendingLock;

	FRunnableThread* Thread = nullptr;
	FThreadSafeBool bShouldRun;
};
