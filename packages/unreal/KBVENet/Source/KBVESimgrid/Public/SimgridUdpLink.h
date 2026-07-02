#pragma once

#include "CoreMinimal.h"
#include "SimgridProto.h"
#include "Containers/Ticker.h"
#include "Common/UdpSocketReceiver.h"
#include "Interfaces/IPv4/IPv4Endpoint.h"

class FSocket;
class FInternetAddr;

class KBVESIMGRID_API FSimgridUdpLink : public TSharedFromThis<FSimgridUdpLink>
{
public:
	DECLARE_DELEGATE_OneParam(FOnUdpSnapshot, const FSimgridSnapshot&);
	FOnUdpSnapshot OnSnapshot;

	~FSimgridUdpLink();

	bool Start(const FString& Host, uint16 Port, uint32 Protocol, const uint8 (&Token)[16]);
	void Stop();
	bool IsActive() const;
	bool SendFrame(const TArray<uint8>& FrameDatagram);

private:
	void HandleReceived(const FArrayReaderPtr& Data, const FIPv4Endpoint& Endpoint);
	void HandleDatagram(TArray<uint8> Datagram);
	bool TickHello(float DeltaTime);
	bool TickWatchdog(float DeltaTime);
	void SendHello();

	FSocket* Socket = nullptr;
	TUniquePtr<FUdpSocketReceiver> Receiver;
	TSharedPtr<FInternetAddr> RemoteAddr;

	FTSTicker::FDelegateHandle HelloTickerHandle;
	FTSTicker::FDelegateHandle WatchdogTickerHandle;

	uint32 Protocol = 0;
	uint8 Token[16] = {};

	int32 HelloAttempts = 0;
	bool bActive = false;
	double LastDatagramTime = 0.0;
};
