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
		UE_LOG(LogKBVESimgrid, Warning, TEXT("Dropped undecodable frame (%d bytes)"), Frame.Num());
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
		OnWelcome.Broadcast((int32)D.Welcome.YourSlot, (int64)D.Welcome.Seed);
		break;
	case EServerEventType::Snapshot:
		LastSnapshot = D.Snapshot;
		OnSnapshot.Broadcast();
		break;
	case EServerEventType::Reject:
		OnRejected.Broadcast(D.Reject.Reason);
		Disconnect();
		break;
	case EServerEventType::Ephemeral:
		UE_LOG(LogKBVESimgrid, Verbose, TEXT("Ephemeral kind=%u (%d bytes)"), D.EphemeralKind, D.EphemeralPayload.Num());
		break;
	default:
		break;
	}
}

void USimgridClientSubsystem::SendMove(const FSimgridMove& Move)
{
	if (State != ESimgridState::Live || !Ws.IsValid())
	{
		return;
	}
	++ClientTick;
	FSimgridMove Tx = Move;
	Tx.Seq = ++MoveSeq;
	Tx.Tick = ClientTick;
	const TArray<uint8> Frame = FProtoCodec::EncodeMoveFrame(ClientTick, Tx);
	Ws->SendBinary(Frame);
}

void USimgridClientSubsystem::HandleClose(int32 Code, const FString& Reason, bool bClean)
{
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
