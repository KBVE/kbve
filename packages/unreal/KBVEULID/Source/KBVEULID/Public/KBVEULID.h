#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

class FKBVEULIDModule : public IModuleInterface
{
public:
	virtual void StartupModule() override {}
	virtual void ShutdownModule() override {}
};

struct KBVEULID_API FKBVEUlid
{
	uint8 Bytes[16];

	FKBVEUlid();

	static FKBVEUlid New();

	FString ToString() const;
};

namespace KBVEULID
{
	KBVEULID_API FString Generate();
}
