#include "chuckArpgPawn.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/WidgetComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Animation/AnimationAsset.h"
#include "UObject/ConstructorHelpers.h"

AchuckArpgPawn::AchuckArpgPawn()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = true;

	Body = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Body"));
	SetRootComponent(Body);
	Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Body->SetMobility(EComponentMobility::Movable);

	static ConstructorHelpers::FObjectFinder<USkeletalMesh> MannyFinder(TEXT("/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple.SKM_Manny_Simple"));
	if (MannyFinder.Succeeded())
	{
		Body->SetSkeletalMesh(MannyFinder.Object);
	}

	PlateComp = CreateDefaultSubobject<UWidgetComponent>(TEXT("PlateComp"));
	PlateComp->SetupAttachment(Body);
	PlateComp->SetRelativeLocation(FVector(0.0f, 0.0f, 230.0f));
	PlateComp->SetWidgetSpace(EWidgetSpace::Screen);
	PlateComp->SetDrawAtDesiredSize(true);
	PlateComp->SetWidgetClass(USimgridNameplateWidget::StaticClass());
	PlateComp->SetVisibility(false);

	static ConstructorHelpers::FObjectFinder<UAnimationAsset> IdleFinder(TEXT("/Game/Characters/Mannequins/Anims/Unarmed/MM_Idle.MM_Idle"));
	static ConstructorHelpers::FObjectFinder<UAnimationAsset> WalkFinder(TEXT("/Game/Characters/Mannequins/Anims/Unarmed/Walk/MF_Unarmed_Walk_Fwd.MF_Unarmed_Walk_Fwd"));
	static ConstructorHelpers::FObjectFinder<UAnimationAsset> JogFinder(TEXT("/Game/Characters/Mannequins/Anims/Unarmed/Jog/MF_Unarmed_Jog_Fwd.MF_Unarmed_Jog_Fwd"));
	if (IdleFinder.Succeeded())
	{
		IdleAnim = IdleFinder.Object;
	}
	if (WalkFinder.Succeeded())
	{
		WalkAnim = WalkFinder.Object;
	}
	if (JogFinder.Succeeded())
	{
		JogAnim = JogFinder.Object;
	}
}

void AchuckArpgPawn::UpdateLocomotion()
{
	if (!Body)
	{
		return;
	}
	const float Speed = (float)FVector2D(Velocity.X, Velocity.Y).Size();
	UAnimationAsset* Anim = IdleAnim;
	if (Speed >= 500.0f)
	{
		Anim = JogAnim ? JogAnim : WalkAnim;
	}
	else if (Speed >= 40.0f)
	{
		Anim = WalkAnim ? WalkAnim : JogAnim;
	}
	if (Anim && Anim != CurrentAnim)
	{
		CurrentAnim = Anim;
		Body->PlayAnimation(Anim, true);
	}
}

USimgridNameplateWidget* AchuckArpgPawn::GetNameplate() const
{
	return PlateComp ? Cast<USimgridNameplateWidget>(PlateComp->GetUserWidgetObject()) : nullptr;
}

void AchuckArpgPawn::SetDisplayName(const FString& Name)
{
	if (DisplayName == Name)
	{
		return;
	}
	if (USimgridNameplateWidget* Plate = GetNameplate())
	{
		DisplayName = Name;
		Plate->SetDisplayName(Name);
		PlateComp->SetVisibility(!Name.IsEmpty());
	}
}

void AchuckArpgPawn::SetBar(ESimgridNameplateBar Bar, float Current, float Max)
{
	if (USimgridNameplateWidget* Plate = GetNameplate())
	{
		Plate->SetBar(Bar, Current, Max);
	}
}

void AchuckArpgPawn::SetVisualMesh(UStaticMesh* Mesh)
{
}

void AchuckArpgPawn::SetMoveIntent(const FVector2D& Dir, bool bInRun)
{
	IntentDir = Dir;
	bRun = bInRun;
}

void AchuckArpgPawn::RecordIntent(uint32 Seq, const FVector2D& Dir, bool bInRun)
{
	if (UnackedIntents.Num() >= MAX_UNACKED)
	{
		UnackedIntents.RemoveAt(0, UnackedIntents.Num() - MAX_UNACKED + 1);
	}
	FchuckPredIntent& I = UnackedIntents.AddDefaulted_GetRef();
	I.Seq = Seq;
	I.Dir = Dir;
	I.bRun = bInRun;
}

void AchuckArpgPawn::StepBody(FVector& Pos, FVector& Vel, const FVector2D& Dir, bool bInRun, float Dt)
{
	const float Speed = bInRun ? RUN_UU : WALK_UU;
	const float Mag = Dir.Size();
	FVector TargetVel = FVector::ZeroVector;
	float Rate = MOVE_FRICTION;
	if (Mag > 0.0f)
	{
		const FVector2D N = Dir / Mag;
		const float Scale = FMath::Min(Mag, 1.0f);
		TargetVel = FVector(N.X * Speed * Scale, N.Y * Speed * Scale, 0.0f);
		Rate = MOVE_ACCEL;
	}

	const float Response = 1.0f - FMath::Exp(-Rate * Dt);
	Vel += (TargetVel - Vel) * Response;
	if (Mag <= 0.0f && Vel.Size() < STOP_UU)
	{
		Vel = FVector::ZeroVector;
	}

	Pos += Vel * Dt;
}

void AchuckArpgPawn::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	UpdateLocomotion();

	if (!bHasServerPos)
	{
		return;
	}

	const float Dt = FMath::Min(DeltaSeconds, 0.05f);
	StepBody(PredictedPos, Velocity, IntentDir, bRun, Dt);
	PredictedPos.Z = ServerZ;

	const float RenderBlend = 1.0f - FMath::Exp(-RENDER_SMOOTH_RATE * Dt);
	RenderPos += (PredictedPos - RenderPos) * RenderBlend;
	RenderPos.Z = PredictedPos.Z;

	SetActorLocation(RenderPos);

	const FVector2D Vel2(Velocity.X, Velocity.Y);
	if (Vel2.Size() >= 40.0f)
	{
		const float MoveYaw = FMath::RadiansToDegrees(FMath::Atan2(Vel2.Y, Vel2.X));
		SetActorRotation(FRotator(0.0f, MoveYaw - 90.0f, 0.0f));
	}

}

void AchuckArpgPawn::ApplyServerCorrection(const FVector& Position, const FVector& Velocity_)
{
	ApplyServerCorrection(Position, Velocity_, LastReplayAck);
}

void AchuckArpgPawn::ApplyServerCorrection(const FVector& Position, const FVector& InVelocity, uint32 InputAck)
{
	ServerZ = Position.Z;
	if (!bHasServerPos)
	{
		bHasServerPos = true;
		PredictedPos = Position;
		RenderPos = Position;
		Velocity = InVelocity;
		LastReplayAck = InputAck;
		LastCorrPos = Position;
		SetActorLocation(Position);
		return;
	}

	if (InputAck == LastReplayAck && Position.Equals(LastCorrPos, 0.01f))
	{
		return;
	}
	LastReplayAck = InputAck;
	LastCorrPos = Position;

	int32 Drop = 0;
	while (Drop < UnackedIntents.Num() && UnackedIntents[Drop].Seq <= InputAck)
	{
		++Drop;
	}
	if (Drop > 0)
	{
		UnackedIntents.RemoveAt(0, Drop);
	}

	FVector P = Position;
	FVector V = InVelocity;
	for (const FchuckPredIntent& I : UnackedIntents)
	{
		StepBody(P, V, I.Dir, I.bRun, SIM_DT);
	}
	P.Z = ServerZ;

	const bool bSnap = FVector::DistSquaredXY(P, PredictedPos) > HARD_SNAP_UU * HARD_SNAP_UU;
	PredictedPos = P;
	Velocity = V;
	if (bSnap)
	{
		RenderPos = P;
	}
}
