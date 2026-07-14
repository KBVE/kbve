#include "SimgridClientSubsystem.h"
#include "SimgridWebSocket.h"
#include "SimgridUdpLink.h"
#include "KBVESimgridModule.h"
#include "KBVESupabaseSubsystem.h"
#include "Engine/GameInstance.h"
#include "HAL/IConsoleManager.h"

static const uint32 GSimgridProtocolVersion = 16;
static const uint16 GSimgridUdpOfferKind = 20;

static TAutoConsoleVariable<FString>* CVarSimgridUdpHost = new TAutoConsoleVariable<FString>(
	TEXT("simgrid.UdpHost"), TEXT(""),
	TEXT("Overrides the UDP fast-lane host instead of deriving it from the WS URL. Empty = use the WS host."),
	ECVF_Default);

void USimgridClientSubsystem::ConnectToServer(const FString& Url)
{
	if (State != ESimgridState::Disconnected)
	{
		UE_LOG(LogKBVESimgrid, Warning, TEXT("ConnectToServer ignored: state not Disconnected"));
		return;
	}

	PendingJwt.Reset();
	PendingUsername.Reset();
	ConnectedUrl = Url;

	if (UGameInstance* GI = GetGameInstance())
	{
		if (UKBVESupabaseSubsystem* Supa = GI->GetSubsystem<UKBVESupabaseSubsystem>())
		{
			PendingJwt = Supa->GetAccessToken();
			PendingUsername = Supa->GetUser().KbveUsername;
		}
	}

	Ws = MakeShared<FSimgridWebSocket>();
	Ws->OnOpen.AddLambda([this]() { HandleOpen(); });
	Ws->OnBinary.AddLambda([this](const TArray<uint8>& Frame) { HandleBinary(Frame); });
	Ws->OnClose.AddLambda([this](int32 Code, const FString& Reason, bool bClean) { HandleClose(Code, Reason, bClean); });
	Ws->OnError.AddLambda([this](const FString& Err) { HandleError(Err); });

	if (PendingJwt.IsEmpty())
	{
		UE_LOG(LogKBVESimgrid, Error, TEXT("Connecting with empty JWT — server will reject. Supabase session missing/expired (check auth/v1/user)."));
	}
	State = ESimgridState::Connecting;
	Ws->Connect(Url);
}

void USimgridClientSubsystem::HandleOpen()
{
	State = ESimgridState::Joining;
	const TArray<uint8> Frame = FProtoCodec::EncodeJoinMatch(GSimgridProtocolVersion, PendingJwt, PendingUsername);
	Ws->SendBinary(Frame);
}

void USimgridClientSubsystem::HandleBinary(const TArray<uint8>& Frame)
{
	const FServerDecoded D = FProtoCodec::DecodeServerEvent(Frame);
	if (!D.bOk)
	{
		UE_LOG(LogKBVESimgrid, Error, TEXT("Undecodable frame (%d bytes) — codec out of sync with server wire format; snapshots dropped, nothing renders."), Frame.Num());
		return;
	}

	switch (D.Type)
	{
	case EServerEventType::Welcome:
		if (D.Welcome.Protocol != GSimgridProtocolVersion)
		{
			UE_LOG(LogKBVESimgrid, Error, TEXT("Protocol mismatch: server %u client %u"), D.Welcome.Protocol, GSimgridProtocolVersion);
			Disconnect();
			return;
		}
		State = ESimgridState::Live;
		Registry = D.Welcome.Registry;
		LastAppliedTick = 0;
		bHasAppliedTick = false;
		OnWelcome.Broadcast((int32)D.Welcome.YourSlot, (int64)D.Welcome.Seed);
		break;
	case EServerEventType::Snapshot:
		ApplySnapshot(D.Snapshot);
		break;
	case EServerEventType::Reject:
		UE_LOG(LogKBVESimgrid, Error, TEXT("[SimgridDiag] Server REJECT reason=%s"), *D.Reject.Reason);
		OnRejected.Broadcast(D.Reject.Reason);
		Disconnect();
		break;
	case EServerEventType::Ephemeral:
		LastEphemeralKind = (int32)D.EphemeralKind;
		LastEphemeralTo = (int32)D.EphemeralTo;
		LastEphemeralPayload = D.EphemeralPayload;
		if (D.EphemeralKind == GSimgridUdpOfferKind)
		{
			HandleUdpOffer(D.EphemeralPayload);
		}
		OnEphemeral.Broadcast();
		break;
	default:
		break;
	}
}

uint32 USimgridClientSubsystem::SendMove(const FSimgridMove& Move)
{
	if (State != ESimgridState::Live || !Ws.IsValid())
	{
		return 0;
	}
	++ClientTick;
	FSimgridMove Tx = Move;
	Tx.Seq = ++MoveSeq;
	Tx.Tick = ClientTick;

	if (UdpLink.IsValid() && UdpLink->IsActive())
	{
		const TArray<uint8> UdpFrame = FProtoCodec::EncodeUdpFrameMove(ClientTick, Tx);
		UdpLink->SendFrame(UdpFrame);
	}
	else
	{
		const TArray<uint8> Frame = FProtoCodec::EncodeMoveFrame(ClientTick, Tx);
		Ws->SendBinary(Frame);
	}
	return Tx.Seq;
}

void USimgridClientSubsystem::ApplySnapshot(const FSimgridSnapshot& Snapshot)
{
	if (bHasAppliedTick && Snapshot.Tick <= LastAppliedTick)
	{
		return;
	}
	LastAppliedTick = Snapshot.Tick;
	bHasAppliedTick = true;
	LastSnapshot = Snapshot;
	OnSnapshot.Broadcast();
}

FString USimgridClientSubsystem::ExtractHostFromUrl(const FString& Url) const
{
	FString Remainder = Url;
	FString Scheme;
	Remainder.Split(TEXT("://"), &Scheme, &Remainder);

	FString HostPort = Remainder;
	int32 SlashIndex = INDEX_NONE;
	if (Remainder.FindChar(TCHAR('/'), SlashIndex))
	{
		HostPort = Remainder.Left(SlashIndex);
	}

	FString Host = HostPort;
	int32 ColonIndex = INDEX_NONE;
	if (HostPort.FindChar(TCHAR(':'), ColonIndex))
	{
		Host = HostPort.Left(ColonIndex);
	}

	return Host;
}

void USimgridClientSubsystem::HandleUdpOffer(const TArray<uint8>& Payload)
{
	const FSimgridUdpOffer Offer = FProtoCodec::DecodeUdpOffer(Payload);
	if (!Offer.bOk)
	{
		UE_LOG(LogKBVESimgrid, Warning, TEXT("HandleUdpOffer: undecodable UdpOffer payload"));
		return;
	}

	const FString OverrideHost = CVarSimgridUdpHost->GetValueOnGameThread();
	const FString Host = OverrideHost.IsEmpty() ? ExtractHostFromUrl(ConnectedUrl) : OverrideHost;
	if (Host.IsEmpty())
	{
		UE_LOG(LogKBVESimgrid, Warning, TEXT("HandleUdpOffer: could not extract host from %s"), *ConnectedUrl);
		return;
	}

	UdpLink = MakeShared<FSimgridUdpLink>();
	TWeakObjectPtr<USimgridClientSubsystem> WeakThis(this);
	UdpLink->OnSnapshot.BindLambda([WeakThis](const FSimgridSnapshot& Snapshot)
	{
		if (USimgridClientSubsystem* Strong = WeakThis.Get())
		{
			Strong->HandleUdpSnapshot(Snapshot);
		}
	});
	if (!UdpLink->Start(Host, Offer.Port, GSimgridProtocolVersion, Offer.Token))
	{
		UE_LOG(LogKBVESimgrid, Warning, TEXT("HandleUdpOffer: failed to start UDP link to %s:%u"), *Host, Offer.Port);
		UdpLink.Reset();
	}
}

void USimgridClientSubsystem::HandleUdpSnapshot(const FSimgridSnapshot& Snapshot)
{
	ApplySnapshot(Snapshot);
}

void USimgridClientSubsystem::HandleClose(int32 Code, const FString& Reason, bool bClean)
{
	UE_LOG(LogKBVESimgrid, Warning, TEXT("[SimgridDiag] WS closed code=%d clean=%d reason=%s (state was %d)"), Code, bClean ? 1 : 0, *Reason, (int32)State);
	TeardownUdpLink();
	State = ESimgridState::Disconnected;
	OnDisconnected.Broadcast();
}

void USimgridClientSubsystem::HandleError(const FString& Err)
{
	UE_LOG(LogKBVESimgrid, Error, TEXT("WebSocket error: %s"), *Err);
	State = ESimgridState::Disconnected;
	OnDisconnected.Broadcast();
}

void USimgridClientSubsystem::TeardownUdpLink()
{
	if (UdpLink.IsValid())
	{
		UdpLink->Stop();
		UdpLink.Reset();
	}
}

void USimgridClientSubsystem::Disconnect()
{
	if (Ws.IsValid())
	{
		Ws->Close();
		Ws.Reset();
	}
	TeardownUdpLink();
	State = ESimgridState::Disconnected;
}

void USimgridClientSubsystem::Deinitialize()
{
	Disconnect();
	Super::Deinitialize();
}
