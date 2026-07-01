#pragma once

#include "CoreMinimal.h"

class KBVESIMGRID_API FSimgridCobs
{
public:
	static TArray<uint8> Encode(const TArray<uint8>& In);
	static bool Decode(const TArray<uint8>& In, TArray<uint8>& Out);
};
