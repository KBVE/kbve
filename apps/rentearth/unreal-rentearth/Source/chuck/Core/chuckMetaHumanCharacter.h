#pragma once

#include "CoreMinimal.h"
#include "chuckCoreCharacter.h"
#include "chuckMetaHumanCharacter.generated.h"

UCLASS(abstract)
class AchuckMetaHumanCharacter : public AchuckCoreCharacter
{
	GENERATED_BODY()

public:
	AchuckMetaHumanCharacter(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());
};
