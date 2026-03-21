#pragma once

#include "CoreMinimal.h"
#include "EditorSubsystem.h"
#include "KBVEUnrealMCPSubsystem.generated.h"

UCLASS()
class KBVEUNREALMCP_API UKBVEUnrealMCPSubsystem : public UEditorSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UWorld* GetEditorWorld() const;
};
