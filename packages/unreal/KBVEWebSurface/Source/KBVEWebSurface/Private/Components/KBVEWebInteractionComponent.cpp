#include "Components/KBVEWebInteractionComponent.h"

UKBVEWebInteractionComponent::UKBVEWebInteractionComponent()
{
	InteractionDistance = 1000.f;
	InteractionSource = EWidgetInteractionSource::World;
	bEnableHitTesting = true;
	bShowDebug = false;
	TraceChannel = ECC_Visibility;
	VirtualUserIndex = 0;
}
