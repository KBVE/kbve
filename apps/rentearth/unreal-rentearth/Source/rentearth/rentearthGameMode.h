// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "rentearthGameMode.generated.h"

/**
 *  Simple GameMode for a third person game
 */
UCLASS(abstract)
class ArentearthGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	
	/** Constructor */
	ArentearthGameMode();
};



