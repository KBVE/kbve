#include "SimgridClientSubsystem.h"
#include "SimgridWebSocket.h"
#include "KBVESimgridModule.h"
#include "KBVESupabaseSubsystem.h"

static const uint32 GSimgridProtocolVersion = 15;

void USimgridClientSubsystem::ConnectToServer(const FString& Url)
{
	if (State != ESimgridState::Disconnected)
	{
		UE_LOG(LogKBVESimgrid, Warning, TEXT("ConnectToServer ignored: state not Disconnected"));
		return;
	}

	PendingJwt.Reset();
	PendingUsername.Reset();

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
		OnWelcome.Broadcast((int32)D.Welcome.YourSlot, (int64)D.Welcome.Seed);
		break;
	case EServerEventType::Snapshot:
		LastSnapshot = D.Snapshot;
		OnSnapshot.Broadcast();
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
	const TArray<uint8> Frame = FProtoCodec::EncodeMoveFrame(ClientTick, Tx);
	Ws->SendBinary(Frame);
	return Tx.Seq;
}

void USimgridClientSubsystem::HandleClose(int32 Code, const FString& Reason, bool bClean)
{
	UE_LOG(LogKBVESimgrid, Warning, TEXT("[SimgridDiag] WS closed code=%d clean=%d reason=%s (state was %d)"), Code, bClean ? 1 : 0, *Reason, (int32)State);
	State = ESimgridState::Disconnected;
	OnDisconnected.Broadcast();
}

void USimgridClientSubsystem::HandleError(const FString& Err)
{
	UE_LOG(LogKBVESimgrid, Error, TEXT("WebSocket error: %s"), *Err);
	State = ESimgridState::Disconnected;
	OnDisconnected.Broadcast();
}

void USimgridClientSubsystem::Disconnect()
{
	if (Ws.IsValid())
	{
		Ws->Close();
		Ws.Reset();
	}
	State = ESimgridState::Disconnected;
}

void USimgridClientSubsystem::Deinitialize()
{
	Disconnect();
	Super::Deinitialize();
}
