#pragma once

#include "CoreMinimal.h"

namespace KBVEUIFlag
{
	constexpr int32 None        = 0;
	constexpr int32 Inventory   = 1 << 0;
	constexpr int32 Pause       = 1 << 1;
	constexpr int32 Settings    = 1 << 2;
	constexpr int32 Map         = 1 << 3;
	constexpr int32 Quest       = 1 << 4;
	constexpr int32 Vendor      = 1 << 5;
	constexpr int32 Chat        = 1 << 6;
	constexpr int32 ChatFocused = 1 << 7;
	constexpr int32 Dialog      = 1 << 8;
	constexpr int32 Loading     = 1 << 9;
	constexpr int32 DevOverlay  = 1 << 10;
	constexpr int32 Tooltip     = 1 << 11;
	constexpr int32 Targeting   = 1 << 12;
	constexpr int32 Cutscene    = 1 << 13;

	// Game-defined flags should start at bit 20 to avoid clashing with these.
	constexpr int32 UserBitStart = 20;
}
