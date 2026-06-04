#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "chuckSettings.generated.h"

// Per-window geometry persisted across sessions. Storage layer is KBVESQLite
// (TODO: wire the actual sqlite3 binding). Subsystem exposes the API now so
// call sites can land + the persistence flip is a one-file change later.
USTRUCT()
struct FchuckWindowGeometry
{
	GENERATED_BODY()

	UPROPERTY() FName     WindowKey;
	UPROPERTY() FVector2D Position = FVector2D(160.f, 140.f);
	UPROPERTY() FVector2D Size     = FVector2D(900.f, 600.f);
};

UCLASS()
class UchuckSettings : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	static UchuckSettings* Get(const UObject* WorldContext);

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	bool GetWindowGeometry(FName WindowKey, FchuckWindowGeometry& OutGeometry) const;
	void SetWindowGeometry(const FchuckWindowGeometry& InGeometry);

private:
	void LoadAll();
	void SaveAll();

	UPROPERTY() TMap<FName, FchuckWindowGeometry> WindowStates;
};
