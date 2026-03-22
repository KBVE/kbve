#include "Server/MCPConnection.h"

FMCPConnection::FMCPConnection(FSocket* InSocket)
	: Socket(InSocket)
	, LastHeartbeatTime(FPlatformTime::Seconds())
{
	ClientId = FGuid::NewGuid().ToString(EGuidFormats::Short);
}
