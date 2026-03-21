#pragma once

#include "CoreMinimal.h"

class INetworkingWebSocket;

struct FMCPConnection
{
	FString ClientId;
	INetworkingWebSocket* Socket = nullptr;
	double LastHeartbeatTime = 0.0;

	FMCPConnection() = default;
	explicit FMCPConnection(INetworkingWebSocket* InSocket);
};
