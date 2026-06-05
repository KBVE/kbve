#include "KBVESupabaseChat.h"
#include "KBVESupabaseSubsystem.h"
#include "KBVESupabaseSettings.h"
#include "KBVESupabaseModule.h"
#include "WebSocketsModule.h"
#include "IWebSocket.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "GenericPlatform/GenericPlatformHttp.h"

namespace
{
	bool StartsWithChannelSigil(const FString& In)
	{
		return In.StartsWith(TEXT("#")) || In.StartsWith(TEXT("&"));
	}

	FString NormalizeChannel(const FString& In)
	{
		FString Trimmed = In.TrimStartAndEnd();
		if (Trimmed.IsEmpty()) return Trimmed;
		return StartsWithChannelSigil(Trimmed) ? Trimmed : (TEXT("#") + Trimmed);
	}

	FString SanitizeLine(const FString& In)
	{
		FString Out = In;
		Out.ReplaceInline(TEXT("\r"), TEXT(""));
		Out.ReplaceInline(TEXT("\n"), TEXT(""));
		return Out;
	}

	FString NickFromPrefix(const FString& Prefix)
	{
		if (Prefix.IsEmpty()) return FString();
		int32 BangIdx = INDEX_NONE;
		if (Prefix.FindChar(TEXT('!'), BangIdx))
		{
			return Prefix.Left(BangIdx);
		}
		int32 AtIdx = INDEX_NONE;
		if (Prefix.FindChar(TEXT('@'), AtIdx))
		{
			return Prefix.Left(AtIdx);
		}
		return Prefix;
	}
}

void UKBVESupabaseChat::Init(UKBVESupabaseSubsystem* InParent)
{
	Parent = InParent;

	if (!FModuleManager::Get().IsModuleLoaded(TEXT("WebSockets")))
	{
		FModuleManager::Get().LoadModule(TEXT("WebSockets"));
	}
}

void UKBVESupabaseChat::BeginDestroy()
{
	bWantsConnection = false;
	ClearReconnect();
	DropSocket();
	Super::BeginDestroy();
}

bool UKBVESupabaseChat::IsConnected() const
{
	return Status == EKBVEChatStatus::Connected && Socket.IsValid() && Socket->IsConnected();
}

void UKBVESupabaseChat::SetStatus(EKBVEChatStatus NewStatus)
{
	if (Status == NewStatus) return;
	const EKBVEChatStatus Old = Status;
	Status = NewStatus;
	OnStatusChanged.Broadcast(Old, NewStatus);
}

void UKBVESupabaseChat::DropSocket()
{
	if (Socket.IsValid())
	{
		Socket->OnConnected().Clear();
		Socket->OnConnectionError().Clear();
		Socket->OnClosed().Clear();
		Socket->OnMessage().Clear();
		if (Socket->IsConnected())
		{
			Socket->Close();
		}
		Socket.Reset();
	}
	RxBuffer.Empty();
	JoinedChannels.Reset();
}

void UKBVESupabaseChat::Connect()
{
	const UKBVESupabaseSettings* Settings = UKBVESupabaseSettings::Get();
	if (!Settings || Settings->ChatURL.IsEmpty())
	{
		HandleError(TEXT("ChatURL not configured"));
		return;
	}

	UKBVESupabaseSubsystem* Sub = Parent.Get();
	if (!Sub)
	{
		HandleError(TEXT("Subsystem unavailable"));
		return;
	}

	const FString AccessToken = Sub->GetAccessToken();
	if (AccessToken.IsEmpty())
	{
		HandleError(TEXT("No active Supabase session; sign in before connecting"));
		return;
	}

	bWantsConnection = true;
	ClearReconnect();
	DropSocket();

	SetStatus(EKBVEChatStatus::Connecting);

	FString URL = Settings->ChatURL;
	TMap<FString, FString> Headers;

	if (Settings->bChatTokenInQueryParam)
	{
		const TCHAR Sep = URL.Contains(TEXT("?")) ? TEXT('&') : TEXT('?');
		URL += FString::Printf(TEXT("%ctoken=%s"), Sep, *FGenericPlatformHttp::UrlEncode(AccessToken));
	}
	else
	{
		Headers.Add(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *AccessToken));
	}

	const FString Protocol = URL.StartsWith(TEXT("wss://")) ? TEXT("wss") : TEXT("ws");

	Socket = FWebSocketsModule::Get().CreateWebSocket(URL, Protocol, Headers);
	if (!Socket.IsValid())
	{
		HandleError(TEXT("Failed to create WebSocket"));
		return;
	}

	TWeakObjectPtr<UKBVESupabaseChat> WeakSelf(this);

	Socket->OnConnected().AddLambda([WeakSelf]()
	{
		if (UKBVESupabaseChat* Self = WeakSelf.Get()) Self->HandleOpen();
	});
	Socket->OnConnectionError().AddLambda([WeakSelf](const FString& Err)
	{
		if (UKBVESupabaseChat* Self = WeakSelf.Get()) Self->HandleError(Err);
	});
	Socket->OnClosed().AddLambda([WeakSelf](int32 StatusCode, const FString& Reason, bool bWasClean)
	{
		if (UKBVESupabaseChat* Self = WeakSelf.Get()) Self->HandleClose(StatusCode, Reason, bWasClean);
	});
	Socket->OnMessage().AddLambda([WeakSelf](const FString& Frame)
	{
		if (UKBVESupabaseChat* Self = WeakSelf.Get()) Self->HandleMessage(Frame);
	});

	Socket->Connect();
}

void UKBVESupabaseChat::Disconnect()
{
	bWantsConnection = false;
	ClearReconnect();
	DropSocket();
	SetStatus(EKBVEChatStatus::Disconnected);
}

void UKBVESupabaseChat::HandleOpen()
{
	ReconnectAttempts = 0;
	SetStatus(EKBVEChatStatus::Connected);
	UE_LOG(LogKBVESupabase, Log, TEXT("Chat WS connected."));
	OnConnected.Broadcast();
	DoAutoJoin();
}

void UKBVESupabaseChat::HandleClose(int32 StatusCode, const FString& Reason, bool /*bWasClean*/)
{
	UE_LOG(LogKBVESupabase, Log, TEXT("Chat WS closed (%d): %s"), StatusCode, *Reason);
	JoinedChannels.Reset();
	RxBuffer.Empty();
	Socket.Reset();
	OnDisconnected.Broadcast(StatusCode, Reason);

	if (bWantsConnection)
	{
		ScheduleReconnect();
	}
	else
	{
		SetStatus(EKBVEChatStatus::Disconnected);
	}
}

void UKBVESupabaseChat::HandleError(const FString& Err)
{
	UE_LOG(LogKBVESupabase, Warning, TEXT("Chat WS error: %s"), *Err);
	SetStatus(EKBVEChatStatus::Error);
	OnError.Broadcast(Err);

	if (bWantsConnection)
	{
		ScheduleReconnect();
	}
}

void UKBVESupabaseChat::HandleMessage(const FString& Frame)
{
	RxBuffer += Frame;

	int32 NewlineIdx = INDEX_NONE;
	while (RxBuffer.FindChar(TEXT('\n'), NewlineIdx))
	{
		FString Line = RxBuffer.Left(NewlineIdx);
		RxBuffer.RightChopInline(NewlineIdx + 1, EAllowShrinking::No);
		if (Line.EndsWith(TEXT("\r")))
		{
			Line.LeftChopInline(1, EAllowShrinking::No);
		}
		if (Line.IsEmpty()) continue;
		HandleRxLine(Line);
	}

	if (!RxBuffer.IsEmpty() && !RxBuffer.Contains(TEXT("\n")))
	{
		const FString Pending = RxBuffer;
		RxBuffer.Empty();
		if (!Pending.IsEmpty())
		{
			HandleRxLine(Pending);
		}
	}
}

void UKBVESupabaseChat::HandleRxLine(const FString& Line)
{
	FKBVEChatIrcLine Parsed;
	if (!ParseIrcLine(Line, Parsed))
	{
		return;
	}

	if (Parsed.Command.Equals(TEXT("PING"), ESearchCase::IgnoreCase))
	{
		const UKBVESupabaseSettings* Settings = UKBVESupabaseSettings::Get();
		if (Settings && Settings->bChatRespondToPing && Socket.IsValid() && Socket->IsConnected())
		{
			const FString Tail = Parsed.Trailing.IsEmpty()
				? (Parsed.Params.Num() > 0 ? Parsed.Params[0] : FString())
				: Parsed.Trailing;
			const FString Pong = Tail.IsEmpty()
				? TEXT("PONG\r\n")
				: FString::Printf(TEXT("PONG :%s\r\n"), *Tail);
			Socket->Send(Pong);
		}
		OnRawLine.Broadcast(Parsed);
		return;
	}

	if (Parsed.Command.Equals(TEXT("JOIN"), ESearchCase::IgnoreCase))
	{
		const FString Channel = Parsed.Params.Num() > 0 ? Parsed.Params[0] : Parsed.Trailing;
		if (!Channel.IsEmpty())
		{
			JoinedChannels.AddUnique(Channel);
			OnChannelJoined.Broadcast(Channel);
		}
	}
	else if (Parsed.Command.Equals(TEXT("PART"), ESearchCase::IgnoreCase))
	{
		const FString Channel = Parsed.Params.Num() > 0 ? Parsed.Params[0] : Parsed.Trailing;
		if (!Channel.IsEmpty())
		{
			JoinedChannels.Remove(Channel);
			OnChannelLeft.Broadcast(Channel);
		}
	}

	OnRawLine.Broadcast(Parsed);

	if (Parsed.Command.Equals(TEXT("PRIVMSG"), ESearchCase::IgnoreCase))
	{
		FKBVEChatMessage Msg;
		if (ExtractChatMessage(Parsed, Msg))
		{
			OnMessage.Broadcast(Msg);
		}
	}
}

void UKBVESupabaseChat::ScheduleReconnect()
{
	const UKBVESupabaseSettings* Settings = UKBVESupabaseSettings::Get();
	if (!Settings || !Settings->bChatAutoReconnect || !bWantsConnection) return;

	UKBVESupabaseSubsystem* Sub = Parent.Get();
	if (!Sub) return;
	UGameInstance* GI = Sub->GetGameInstance();
	if (!GI) return;
	UWorld* World = GI->GetWorld();
	if (!World) return;

	ReconnectAttempts = FMath::Min(ReconnectAttempts + 1, 16);
	const int32 BaseDelay = FMath::Max(1, Settings->ChatReconnectInitialDelaySeconds);
	const int32 MaxDelay  = FMath::Max(BaseDelay, Settings->ChatReconnectMaxDelaySeconds);
	const int32 Delay = FMath::Min(BaseDelay * (1 << FMath::Min(ReconnectAttempts - 1, 8)), MaxDelay);

	SetStatus(EKBVEChatStatus::Reconnecting);

	TWeakObjectPtr<UKBVESupabaseChat> WeakSelf(this);
	World->GetTimerManager().ClearTimer(ReconnectTimerHandle);
	World->GetTimerManager().SetTimer(ReconnectTimerHandle, FTimerDelegate::CreateLambda([WeakSelf]()
	{
		if (UKBVESupabaseChat* Self = WeakSelf.Get())
		{
			Self->Connect();
		}
	}), static_cast<float>(Delay), false);

	UE_LOG(LogKBVESupabase, Log, TEXT("Chat WS reconnect in %ds (attempt %d)"), Delay, ReconnectAttempts);
}

void UKBVESupabaseChat::ClearReconnect()
{
	if (UKBVESupabaseSubsystem* Sub = Parent.Get())
	{
		if (UGameInstance* GI = Sub->GetGameInstance())
		{
			if (UWorld* World = GI->GetWorld())
			{
				World->GetTimerManager().ClearTimer(ReconnectTimerHandle);
			}
		}
	}
}

void UKBVESupabaseChat::DoAutoJoin()
{
	const UKBVESupabaseSettings* Settings = UKBVESupabaseSettings::Get();
	if (!Settings) return;
	for (const FString& Channel : Settings->ChatAutoJoinChannels)
	{
		JoinChannel(Channel);
	}
}

bool UKBVESupabaseChat::SendRawLine(const FString& Line)
{
	if (!Socket.IsValid() || !Socket->IsConnected()) return false;
	const FString Clean = SanitizeLine(Line);
	if (Clean.IsEmpty()) return false;
	Socket->Send(Clean + TEXT("\r\n"));
	return true;
}

bool UKBVESupabaseChat::SendPrivMsg(const FString& Channel, const FString& Body)
{
	const FString Target = NormalizeChannel(Channel);
	if (Target.IsEmpty() || Body.IsEmpty()) return false;
	return SendRawLine(FString::Printf(TEXT("PRIVMSG %s :%s"), *Target, *SanitizeLine(Body)));
}

bool UKBVESupabaseChat::JoinChannel(const FString& Channel)
{
	const FString Target = NormalizeChannel(Channel);
	if (Target.IsEmpty()) return false;
	return SendRawLine(FString::Printf(TEXT("JOIN %s"), *Target));
}

bool UKBVESupabaseChat::PartChannel(const FString& Channel, const FString& Reason)
{
	const FString Target = NormalizeChannel(Channel);
	if (Target.IsEmpty()) return false;
	const FString Line = Reason.IsEmpty()
		? FString::Printf(TEXT("PART %s"), *Target)
		: FString::Printf(TEXT("PART %s :%s"), *Target, *SanitizeLine(Reason));
	return SendRawLine(Line);
}

bool UKBVESupabaseChat::ParseIrcLine(const FString& InRaw, FKBVEChatIrcLine& OutLine)
{
	OutLine = FKBVEChatIrcLine();
	FString Raw = InRaw;
	if (Raw.EndsWith(TEXT("\r"))) Raw.LeftChopInline(1, EAllowShrinking::No);
	if (Raw.IsEmpty()) return false;
	OutLine.Raw = Raw;

	int32 Cursor = 0;

	if (Raw[0] == TEXT(':'))
	{
		int32 Space = INDEX_NONE;
		if (!Raw.FindChar(TEXT(' '), Space))
		{
			return false;
		}
		OutLine.Prefix = Raw.Mid(1, Space - 1);
		OutLine.Sender = NickFromPrefix(OutLine.Prefix);
		Cursor = Space + 1;
	}

	int32 TrailingIdx = Raw.Find(TEXT(" :"), ESearchCase::CaseSensitive, ESearchDir::FromStart, Cursor);
	FString PreTrailing;
	if (TrailingIdx != INDEX_NONE)
	{
		PreTrailing = Raw.Mid(Cursor, TrailingIdx - Cursor);
		OutLine.Trailing = Raw.Mid(TrailingIdx + 2);
	}
	else
	{
		PreTrailing = Raw.Mid(Cursor);
	}

	TArray<FString> Tokens;
	PreTrailing.ParseIntoArrayWS(Tokens);
	if (Tokens.Num() == 0 && OutLine.Trailing.IsEmpty()) return false;
	if (Tokens.Num() > 0)
	{
		OutLine.Command = Tokens[0];
		for (int32 i = 1; i < Tokens.Num(); ++i)
		{
			OutLine.Params.Add(Tokens[i]);
		}
	}

	return !OutLine.Command.IsEmpty() || !OutLine.Trailing.IsEmpty();
}

bool UKBVESupabaseChat::ExtractChatMessage(const FKBVEChatIrcLine& Line, FKBVEChatMessage& OutMessage)
{
	OutMessage = FKBVEChatMessage();
	if (!Line.Command.Equals(TEXT("PRIVMSG"), ESearchCase::IgnoreCase)) return false;
	if (Line.Params.Num() == 0) return false;

	OutMessage.Channel = Line.Params[0];
	OutMessage.Nick = Line.Sender;
	OutMessage.ReceivedAt = FDateTime::UtcNow();

	FString Text = Line.Trailing;
	if (Text.IsEmpty()) return false;

	if (Text.StartsWith(TEXT("[")))
	{
		const int32 CloseIdx = Text.Find(TEXT("]"));
		if (CloseIdx != INDEX_NONE)
		{
			OutMessage.Kind = Text.Mid(1, CloseIdx - 1);
			OutMessage.bIsEvent = OutMessage.Kind.StartsWith(TEXT("EVENT"));
			Text = Text.Mid(CloseIdx + 1).TrimStart();
		}
	}

	const int32 ColonIdx = Text.Find(TEXT(": "));
	if (ColonIdx != INDEX_NONE)
	{
		const FString SenderPart = Text.Left(ColonIdx);
		const int32 AtIdx = SenderPart.Find(TEXT("@"));
		if (AtIdx != INDEX_NONE)
		{
			OutMessage.Sender = SenderPart.Left(AtIdx);
			OutMessage.Platform = SenderPart.Mid(AtIdx + 1);
		}
		else
		{
			OutMessage.Sender = SenderPart;
		}
		OutMessage.Body = Text.Mid(ColonIdx + 2);
	}
	else
	{
		OutMessage.Body = Text;
	}

	if (OutMessage.Sender.IsEmpty()) OutMessage.Sender = OutMessage.Nick;
	if (OutMessage.Kind.IsEmpty()) OutMessage.Kind = TEXT("CHAT");

	return !OutMessage.Body.IsEmpty();
}
