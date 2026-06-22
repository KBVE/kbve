#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Mass/EntityHandle.h"
#include "MassEntityTypes.h"
#include "KBVENpcFragment.h"
#include "KBVENpcTypes.h"
#include "KBVENpcSpawner.generated.h"

UCLASS()
class KBVENPCDB_API UKBVENpcSpawner : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	FMassEntityHandle SpawnNpcEntity(const FKBVENpcDef& Def, int32 LevelOverride = -1);

	static FKBVENpcFragment MakeFragment(const FKBVENpcDef& Def, int32 LevelOverride = -1);
};
