#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "KBVESupabaseTypes.h"
#include "KBVESupabaseChat.generated.h"

class UKBVESupabaseSubsystem;
class IWebSocket;

/**
 * Thin WebSocket client for the KBVE irc-gateway (chat.kbve.com/ws).
 *
 * - JWT injected from the active Supabase session as
 *   `Authorization: Bearer <access_token>` on the WS upgrade.
 * - Server pre-registers NICK + USER from the JWT, so the client
 *   skips IRC registration and only sends JOIN / PRIVMSG / PART.
 * - PING auto-responded with PONG (configurable).
 * - Auto-reconnect with exponential backoff (configurable).
 * - Raw IRC line framing; convenience parser splits PRIVMSG bodies
 *   of the form `[KIND] sender@platform: content` into FKBVEChatMessage.
 *
 * Access: `GetGameInstance()->GetSubsystem<UKBVESupabaseSubsystem>()->GetChat()`
 */
UCLASS(BlueprintType)
class KBVESUPABASE_API UKBVESupabaseChat : public UObject
{
	GENERATED_BODY()

public:
	void Init(UKBVESupabaseSubsystem* InParent);

	virtual void BeginDestroy() override;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Chat")
	void Connect();

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Chat")
	void Disconnect();

	UFUNCTION(BlueprintPure, Category = "KBVE|Supabase|Chat")
	bool IsConnected() const;

	UFUNCTION(BlueprintPure, Category = "KBVE|Supabase|Chat")
	EKBVEChatStatus GetStatus() const { return Status; }

	UFUNCTION(BlueprintPure, Category = "KBVE|Supabase|Chat")
	const TArray<FString>& GetJoinedChannels() const { return JoinedChannels; }

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Chat")
	bool SendRawLine(const FString& Line);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Chat")
	bool SendPrivMsg(const FString& Channel, const FString& Body);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Chat")
	bool JoinChannel(const FString& Channel);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Chat")
	bool PartChannel(const FString& Channel, const FString& Reason);

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Supabase|Chat|Events")
	FOnKBVEChatConnected OnConnected;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Supabase|Chat|Events")
	FOnKBVEChatDisconnected OnDisconnected;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Supabase|Chat|Events")
	FOnKBVEChatError OnError;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Supabase|Chat|Events")
	FOnKBVEChatMessage OnMessage;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Supabase|Chat|Events")
	FOnKBVEChatRawLine OnRawLine;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Supabase|Chat|Events")
	FOnKBVEChatChannelJoined OnChannelJoined;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Supabase|Chat|Events")
	FOnKBVEChatChannelLeft OnChannelLeft;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Supabase|Chat|Events")
	FOnKBVEChatStatusChanged OnStatusChanged;

	UFUNCTION(BlueprintPure, Category = "KBVE|Supabase|Chat")
	static bool ParseIrcLine(const FString& InRaw, FKBVEChatIrcLine& OutLine);

	UFUNCTION(BlueprintPure, Category = "KBVE|Supabase|Chat")
	static bool ExtractChatMessage(const FKBVEChatIrcLine& Line, FKBVEChatMessage& OutMessage);

protected:
	UPROPERTY(Transient)
	TWeakObjectPtr<UKBVESupabaseSubsystem> Parent;

	UPROPERTY(Transient)
	EKBVEChatStatus Status = EKBVEChatStatus::Disconnected;

	UPROPERTY(Transient)
	TArray<FString> JoinedChannels;

	TSharedPtr<IWebSocket> Socket;

	FString RxBuffer;
	int32 ReconnectAttempts = 0;
	FTimerHandle ReconnectTimerHandle;
	bool bWantsConnection = false;

	void SetStatus(EKBVEChatStatus NewStatus);
	void DropSocket();
	void HandleOpen();
	void HandleClose(int32 StatusCode, const FString& Reason, bool bWasClean);
	void HandleError(const FString& Err);
	void HandleMessage(const FString& Frame);
	void HandleRxLine(const FString& Line);
	void ScheduleReconnect();
	void ClearReconnect();
	void DoAutoJoin();
};
