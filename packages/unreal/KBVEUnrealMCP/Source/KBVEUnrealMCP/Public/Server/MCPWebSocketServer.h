#pragma once

#include "CoreMinimal.h"
#include "HAL/Runnable.h"
#include "HAL/ThreadSafeBool.h"
#include "Server/MCPConnection.h"

class FMCPHandlerRegistry;
class IWebSocketServer;
class INetworkingWebSocket;

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
	void OnClientConnected(INetworkingWebSocket* ClientSocket);
	void OnMessage(void* Data, int32 Count, INetworkingWebSocket* Client);
	void OnRawMessage(const FString& RawMessage, INetworkingWebSocket* Client);
	void OnClientDisconnected(INetworkingWebSocket* Client);

	void SendToClient(INetworkingWebSocket* Client, const FString& Message);

	FMCPHandlerRegistry& Registry;
	int32 Port;

	TSharedPtr<IWebSocketServer> WebSocketServer;
	TMap<INetworkingWebSocket*, TSharedPtr<FMCPConnection>> Connections;
	FCriticalSection ConnectionsLock;

	FRunnableThread* Thread = nullptr;
	FThreadSafeBool bShouldRun;
};
