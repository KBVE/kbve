#include "Server/MCPConnection.h"

FMCPConnection::FMCPConnection(INetworkingWebSocket* InSocket)
	: Socket(InSocket)
	, LastHeartbeatTime(FPlatformTime::Seconds())
{
	ClientId = FGuid::NewGuid().ToString(EGuidFormats::Short);
}
