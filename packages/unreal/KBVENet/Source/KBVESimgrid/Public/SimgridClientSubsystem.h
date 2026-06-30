#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "SimgridProto.h"
#include "SimgridClientSubsystem.generated.h"

class FSimgridWebSocket;

UENUM(BlueprintType)
enum class ESimgridState : uint8
{
	Disconnected,
	Connecting,
	Joining,
	Live
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FSimgridOnWelcome, int32, YourSlot, int64, Seed);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FSimgridOnSnapshot);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FSimgridOnRejected, const FString&, Reason);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FSimgridOnDisconnected);

UCLASS()
class KBVESIMGRID_API USimgridClientSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Deinitialize() override;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Simgrid")
	void ConnectToServer(const FString& Url);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Simgrid")
	void Disconnect();

	void SendMove(const FSimgridMove& Move);

	UFUNCTION(BlueprintPure, Category = "KBVE|Simgrid")
	ESimgridState GetState() const { return State; }

	const FSimgridSnapshot& GetLastSnapshot() const { return LastSnapshot; }

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Simgrid")
	FSimgridOnWelcome OnWelcome;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Simgrid")
	FSimgridOnSnapshot OnSnapshot;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Simgrid")
	FSimgridOnRejected OnRejected;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Simgrid")
	FSimgridOnDisconnected OnDisconnected;

private:
	void HandleOpen();
	void HandleBinary(const TArray<uint8>& Frame);
	void HandleClose(int32 Code, const FString& Reason, bool bClean);
	void HandleError(const FString& Err);

	TSharedPtr<FSimgridWebSocket> Ws;
	ESimgridState State = ESimgridState::Disconnected;
	FString PendingJwt;
	FString PendingUsername;
	uint32 ClientTick = 0;
	uint32 MoveSeq = 0;
	FSimgridSnapshot LastSnapshot;
};
