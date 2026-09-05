#pragma once

// Shared between the anim instance and the grip solver, which are separate
// translation units because the grip is a separate problem: the anim instance
// places limbs, the solver decides how a hand meets a particular weapon. They
// share only the console handles that tune the grip and the log category the
// tuning is read back through.

#include "CoreMinimal.h"

KBVEMOVER_API DECLARE_LOG_CATEGORY_EXTERN(LogKBVEFootIK, Display, All);

namespace KBVEGrip
{
	extern float GGripCurl;
	extern float GGripThumb;
	extern int32 GGripAxis;
	extern float GGripRoll;
	extern float GGripBoreAngle;
	extern float GGripWidth;
	extern float GGripHeight;
	extern float GGripCentre;
	extern float GGripAlong;
	extern float GGripLean;
	extern float GGripTwist;
	extern float GGripRoll2;
	extern int32 GGripPalmFlip;
	extern int32 GGripFingers;
	extern float GGripBend;
	extern float GWristTwistShare;
	extern int32 GGripContact;
	extern int32 GGripTrace;
	extern int32 GGripDerive;
	extern int32 GGripWrap;
}
