#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "chuckMenuPlayerController.generated.h"

class SchuckMainMenu;
class SchuckCharacterSelect;
class SKBVELoginWidget;
class SKBVEAccountPanel;
class SKBVELoadingPanel;
class UKBVESupabaseSubsystem;
class SchuckUsernameSetup;
class UchuckKbveApiClient;
struct FKBVESupabaseSession;
struct FROWSUserCharacter;

UCLASS()
class AchuckMenuPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	AchuckMenuPlayerController();

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Menu")
	FName PlayLevelName = TEXT("L_ChuckWorld");

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Menu")
	bool bUseOnlineTravel = false;

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Menu")
	FString DefaultZone = TEXT("HubWorld");

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void Tick(float DeltaSeconds) override;

private:
	void HandlePlay();
	void HandleQuit();
	void TickLoadingTransition(float DeltaSeconds);

	void RefreshAuthVisibility(bool bSignedIn);
	void HandleUsernameSet();
	void HandleUsernameSessionExpired();

	UFUNCTION()
	void HandleSupabaseSignedIn(const FKBVESupabaseSession& Session);
	UFUNCTION()
	void HandleSupabaseSignedOut();
	UFUNCTION()
	void HandleSupabaseSessionRefreshed(const FKBVESupabaseSession& Session);

	UFUNCTION()
	void HandleSessionReady(const FString& UserSessionGUID);

	UFUNCTION()
	void HandleCharactersUpdated(const TArray<FROWSUserCharacter>& Characters);

	UFUNCTION()
	void HandleServerReady(const FString& ServerIP, int32 Port);

	UFUNCTION()
	void HandleSessionError(const FString& ErrorMessage);

	void EnterSelectedWorld();

	void ApplyAccountFromSession(const FKBVESupabaseSession& Session);

	TSharedPtr<SchuckMainMenu>     MenuWidget;
	TSharedPtr<SchuckCharacterSelect> CharSelectWidget;
	TSharedPtr<SKBVELoginWidget>  LoginWidget;
	TSharedPtr<SchuckUsernameSetup> UsernameWidget;
	TSharedPtr<SKBVEAccountPanel> AccountWidget;
	TSharedPtr<SKBVELoadingPanel> LoadingWidget;
	TWeakObjectPtr<UchuckKbveApiClient> ApiClient;

	UPROPERTY(Transient)
	TWeakObjectPtr<UKBVESupabaseSubsystem> SupabaseSubsystem;

	bool       bLoadingActive = false;
	uint32     LoadingSeed    = 0;
	FIntPoint  LoadingAnchor  = FIntPoint::ZeroValue;
	float      LoadingElapsed = 0.f;
};
