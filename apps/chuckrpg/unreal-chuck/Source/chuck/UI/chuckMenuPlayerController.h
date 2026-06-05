#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "chuckMenuPlayerController.generated.h"

class SchuckMainMenu;
class SchuckLoginWidget;
class SchuckAccountPanel;
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

private:
	void HandlePlay();
	void HandleQuit();

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

	UPROPERTY(Transient)
	TWeakObjectPtr<UKBVESupabaseSubsystem> SupabaseSubsystem;
};
