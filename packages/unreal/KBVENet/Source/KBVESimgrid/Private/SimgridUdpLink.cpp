#include "SimgridUdpLink.h"
#include "KBVESimgridModule.h"
#include "Sockets.h"
#include "SocketSubsystem.h"
#include "IPAddress.h"
#include "Common/UdpSocketBuilder.h"
#include "Common/UdpSocketReceiver.h"
#include "Interfaces/IPv4/IPv4Address.h"
#include "Interfaces/IPv4/IPv4Endpoint.h"
#include "Serialization/ArrayReader.h"
#include "Async/Async.h"
#include "HAL/PlatformTime.h"

namespace
{
	constexpr float HelloIntervalSeconds = 0.25f;
	constexpr int32 HelloMaxAttempts = 20;
	constexpr double WatchdogTimeoutSeconds = 3.0;
	constexpr double KeepaliveIntervalSeconds = 2.0;
}

FSimgridUdpLink::~FSimgridUdpLink()
{
	Stop();
}

bool FSimgridUdpLink::Start(const FString& Host, uint16 Port, uint32 InProtocol, const uint8 (&InToken)[16])
{
	Stop();

	ISocketSubsystem* SocketSub = ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM);
	if (!SocketSub)
	{
		UE_LOG(LogKBVESimgrid, Error, TEXT("FSimgridUdpLink::Start: no socket subsystem"));
		return false;
	}

	TSharedRef<FInternetAddr> Addr = SocketSub->CreateInternetAddr();
	bool bValidIp = false;
	Addr->SetIp(*Host, bValidIp);
	if (!bValidIp)
	{
		FAddressInfoResult ResolveResult = SocketSub->GetAddressInfo(
			*Host, nullptr, EAddressInfoFlags::Default, NAME_None);
		if (ResolveResult.ReturnCode != SE_NO_ERROR || ResolveResult.Results.Num() == 0)
		{
			UE_LOG(LogKBVESimgrid, Error, TEXT("FSimgridUdpLink::Start: failed to resolve host %s"), *Host);
			return false;
		}
		Addr = ResolveResult.Results[0].Address;
	}
	Addr->SetPort(Port);
	RemoteAddr = Addr;

	Socket = FUdpSocketBuilder(TEXT("SimgridUdpLink"))
		.AsNonBlocking()
		.AsReusable();

	if (!Socket)
	{
		UE_LOG(LogKBVESimgrid, Error, TEXT("FSimgridUdpLink::Start: failed to build socket"));
		return false;
	}

	Protocol = InProtocol;
	FMemory::Memcpy(Token, InToken, sizeof(Token));
	HelloAttempts = 0;
	bActive = false;

	Receiver = MakeUnique<FUdpSocketReceiver>(Socket, FTimespan::FromMilliseconds(100), TEXT("SimgridUdpLinkReceiver"));
	Receiver->OnDataReceived().BindRaw(this, &FSimgridUdpLink::HandleReceived);
	Receiver->Start();

	TWeakPtr<FSimgridUdpLink> WeakSelf = AsShared();
	HelloTickerHandle = FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateLambda(
		[WeakSelf](float DeltaTime) -> bool
		{
			if (TSharedPtr<FSimgridUdpLink> Pinned = WeakSelf.Pin())
			{
				return Pinned->TickHello(DeltaTime);
			}
			return false;
		}), HelloIntervalSeconds);

	WatchdogTickerHandle = FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateLambda(
		[WeakSelf](float DeltaTime) -> bool
		{
			if (TSharedPtr<FSimgridUdpLink> Pinned = WeakSelf.Pin())
			{
				return Pinned->TickWatchdog(DeltaTime);
			}
			return false;
		}), 0.5f);

	SendHello();
	++HelloAttempts;

	return true;
}

void FSimgridUdpLink::SendHello()
{
	const TArray<uint8> Hello = FProtoCodec::EncodeUdpHello(Protocol, Token);
	SendFrame(Hello);
}

bool FSimgridUdpLink::TickHello(float DeltaTime)
{
	if (bActive)
	{
		if ((FPlatformTime::Seconds() - LastSentTime) > KeepaliveIntervalSeconds)
		{
			SendHello();
		}
		return true;
	}

	if (HelloAttempts >= HelloMaxAttempts)
	{
		UE_LOG(LogKBVESimgrid, Warning, TEXT("FSimgridUdpLink: Hello attempts exhausted, staying WS-only"));
		HelloTickerHandle.Reset();
		return false;
	}

	SendHello();
	++HelloAttempts;
	return true;
}

bool FSimgridUdpLink::TickWatchdog(float DeltaTime)
{
	if (bActive && (FPlatformTime::Seconds() - LastDatagramTime) > WatchdogTimeoutSeconds)
	{
		UE_LOG(LogKBVESimgrid, Warning, TEXT("FSimgridUdpLink: watchdog timeout, reverting to WS"));
		bActive = false;
		HelloAttempts = 0;
		if (!HelloTickerHandle.IsValid())
		{
			TWeakPtr<FSimgridUdpLink> WeakSelf = AsShared();
			HelloTickerHandle = FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateLambda(
				[WeakSelf](float InDeltaTime) -> bool
				{
					if (TSharedPtr<FSimgridUdpLink> Pinned = WeakSelf.Pin())
					{
						return Pinned->TickHello(InDeltaTime);
					}
					return false;
				}), HelloIntervalSeconds);
		}
	}
	return true;
}

void FSimgridUdpLink::HandleReceived(const FArrayReaderPtr& Data, const FIPv4Endpoint& Endpoint)
{
	TArray<uint8> Datagram;
	Datagram.Append(Data->GetData(), Data->Num());

	TWeakPtr<FSimgridUdpLink> WeakSelf = AsShared();
	AsyncTask(ENamedThreads::GameThread, [WeakSelf, Datagram = MoveTemp(Datagram)]() mutable
	{
		if (TSharedPtr<FSimgridUdpLink> Pinned = WeakSelf.Pin())
		{
			Pinned->HandleDatagram(MoveTemp(Datagram));
		}
	});
}

void FSimgridUdpLink::HandleDatagram(TArray<uint8> Datagram)
{
	const FUdpDecoded Decoded = FProtoCodec::DecodeUdpPacket(Datagram);
	if (!Decoded.bOk)
	{
		return;
	}

	LastDatagramTime = FPlatformTime::Seconds();

	if (Decoded.Type == EUdpPacketType::HelloAck)
	{
		if (!bActive)
		{
			UE_LOG(LogKBVESimgrid, Log, TEXT("FSimgridUdpLink: HelloAck received, UDP fast lane active"));
		}
		bActive = true;
		return;
	}

	if (Decoded.Type == EUdpPacketType::Snapshot)
	{
		bActive = true;
		OnSnapshot.ExecuteIfBound(Decoded.Snapshot);
	}
}

bool FSimgridUdpLink::SendFrame(const TArray<uint8>& FrameDatagram)
{
	if (!Socket || !RemoteAddr.IsValid())
	{
		return false;
	}

	LastSentTime = FPlatformTime::Seconds();
	int32 BytesSent = 0;
	return Socket->SendTo(FrameDatagram.GetData(), FrameDatagram.Num(), BytesSent, *RemoteAddr);
}

bool FSimgridUdpLink::IsActive() const
{
	return bActive;
}

void FSimgridUdpLink::Stop()
{
	if (HelloTickerHandle.IsValid())
	{
		FTSTicker::GetCoreTicker().RemoveTicker(HelloTickerHandle);
		HelloTickerHandle.Reset();
	}
	if (WatchdogTickerHandle.IsValid())
	{
		FTSTicker::GetCoreTicker().RemoveTicker(WatchdogTickerHandle);
		WatchdogTickerHandle.Reset();
	}

	if (Receiver.IsValid())
	{
		Receiver->Stop();
		Receiver.Reset();
	}

	if (Socket)
	{
		Socket->Close();
		if (ISocketSubsystem* SocketSub = ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM))
		{
			SocketSub->DestroySocket(Socket);
		}
		Socket = nullptr;
	}

	RemoteAddr.Reset();
	bActive = false;
	HelloAttempts = 0;
	LastSentTime = 0.0;
}
