#pragma once

#include "CoreMinimal.h"
#include "Sockets.h"

struct FMCPConnection
{
	FString ClientId;
	FSocket* Socket = nullptr;
	double LastHeartbeatTime = 0.0;
	FString ReceiveBuffer;

	FMCPConnection() = default;
	explicit FMCPConnection(FSocket* InSocket);
};
