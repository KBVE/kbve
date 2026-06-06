#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "chuckMenuPlayerController.generated.h"

class SchuckMainMenu;
class SchuckLoginWidget;
class SchuckAccountPanel;
class SchuckLoadingPanel;
class UKBVESupabaseSubsystem;
struct FKBVESupabaseSession;

UCLASS()
class AchuckMenuPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	AchuckMenuPlayerController();

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Menu")
	FName PlayLevelName = TEXT("L_ChuckWorld");

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void Tick(float DeltaSeconds) override;

private:
	void HandlePlay();
	void HandleQuit();
	void TickLoadingTransition(float DeltaSeconds);

	void RefreshAuthVisibility(bool bSignedIn);

	UFUNCTION()
	void HandleSupabaseSignedIn(const FKBVESupabaseSession& Session);
	UFUNCTION()
	void HandleSupabaseSignedOut();
	UFUNCTION()
	void HandleSupabaseSessionRefreshed(const FKBVESupabaseSession& Session);

	void ApplyAccountFromSession(const FKBVESupabaseSession& Session);

	TSharedPtr<SchuckMainMenu>     MenuWidget;
	TSharedPtr<SchuckLoginWidget>  LoginWidget;
	TSharedPtr<SchuckAccountPanel> AccountWidget;
	TSharedPtr<SchuckLoadingPanel> LoadingWidget;

	UPROPERTY(Transient)
	TWeakObjectPtr<UKBVESupabaseSubsystem> SupabaseSubsystem;

	bool       bLoadingActive = false;
	uint32     LoadingSeed    = 0;
	FIntPoint  LoadingAnchor  = FIntPoint::ZeroValue;
	float      LoadingElapsed = 0.f;
};
