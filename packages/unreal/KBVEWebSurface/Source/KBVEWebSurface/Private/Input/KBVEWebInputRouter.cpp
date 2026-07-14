#include "Input/KBVEWebInputRouter.h"

#include "GameFramework/Actor.h"
#include "Engine/World.h"
#include "Camera/CameraComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Components/PrimitiveComponent.h"

FVector2D UKBVEWebInputRouter::HitToWidgetCoord(const FHitResult& Hit, FIntPoint WidgetSize)
{
	FVector2D UV = FVector2D::ZeroVector;
	if (Hit.GetComponent())
	{
		UGameplayStatics::FindCollisionUV(Hit, 0, UV);
	}
	return FVector2D(UV.X * WidgetSize.X, UV.Y * WidgetSize.Y);
}

bool UKBVEWebInputRouter::TraceForSurface(AActor* Instigator, float MaxDistance, FHitResult& OutHit)
{
	if (!Instigator)
	{
		return false;
	}
	UWorld* World = Instigator->GetWorld();
	if (!World)
	{
		return false;
	}
	UCameraComponent* Cam = Instigator->FindComponentByClass<UCameraComponent>();
	if (!Cam)
	{
		return false;
	}
	const FVector Start = Cam->GetComponentLocation();
	const FVector End = Start + Cam->GetForwardVector() * MaxDistance;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(KBVEWebSurfaceTrace), true, Instigator);
	Params.bReturnFaceIndex = true;
	return World->LineTraceSingleByChannel(OutHit, Start, End, ECC_Visibility, Params);
}
