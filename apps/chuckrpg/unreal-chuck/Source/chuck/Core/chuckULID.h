#pragma once

#include "CoreMinimal.h"

struct FchuckULID
{
	uint8 Bytes[16];

	FchuckULID();

	static FchuckULID New();

	FString ToString() const;
};

namespace chuckULID
{
	FString Generate();
}
