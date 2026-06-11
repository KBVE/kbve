#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KBVESettingsStore.h"
#include "chuckSettings.generated.h"

USTRUCT()
struct FchuckWindowGeometry
{
	GENERATED_BODY()

	UPROPERTY() FName     WindowKey;
	UPROPERTY() FVector2D Position = FVector2D(160.f, 140.f);
	UPROPERTY() FVector2D Size     = FVector2D(900.f, 600.f);
};

// Player-facing graphics options. Every enhancement defaults to the cheap
// profile (off / TAA / uncapped); each is overridable from the settings window
// and persisted to the SQLite store. AntiAliasing: 0 None, 1 FXAA, 2 TAA, 3 TSR.
USTRUCT()
struct FchuckGraphicsSettings
{
	GENERATED_BODY()

	UPROPERTY() bool  bLumenGI           = false;
	UPROPERTY() bool  bLumenReflections  = false;
	UPROPERTY() bool  bVirtualShadowMaps = false;
	UPROPERTY() bool  bRayTracing        = false;
	UPROPERTY() bool  bMotionBlur        = false;
	UPROPERTY() bool  bBloom             = false;
	UPROPERTY() int32 AntiAliasing       = 2;
	UPROPERTY() int32 MSAASamples        = 0;
	UPROPERTY() bool  bVSync             = false;
	UPROPERTY() float ResolutionScale    = 100.f;
	UPROPERTY() int32 FpsCap             = 0;
};

UCLASS()
class UchuckSettings : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UchuckSettings();
	virtual ~UchuckSettings() override;

	static UchuckSettings* Get(const UObject* WorldContext);

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	bool GetWindowGeometry(FName WindowKey, FchuckWindowGeometry& OutGeometry) const;
	void SetWindowGeometry(const FchuckWindowGeometry& InGeometry);

	const FchuckGraphicsSettings& GetGraphics() const { return Graphics; }
	void SetGraphics(const FchuckGraphicsSettings& InGraphics, bool bApply = true);
	void ResetGraphicsToDefaults(bool bApply = true);
	void ApplyGraphics() const;

private:
	void LoadAll();
	void LoadGraphics();
	void SaveGraphics() const;

	UPROPERTY() TMap<FName, FchuckWindowGeometry> WindowStates;

	UPROPERTY() FchuckGraphicsSettings Graphics;

	TUniquePtr<FKBVESettingsStore> Store;
};
