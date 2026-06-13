#include "chuckSlimeSubsystem.h"
#include "chuckSlimeTypes.h"
#include "chuckSlimeNetActor.h"
#include "KBVENetEntityReplicator.h"
#include "KBVENpcSpriteDef.h"
#include "KBVENpcDatabase.h"
#include "KBVENpcTypes.h"

#include "EngineUtils.h"
#include "MassEntitySubsystem.h"
#include "MassEntityManager.h"
#include "MassCommonFragments.h"
#include "KBVEStatFragment.h"
#include "Components/SphereComponent.h"
#include "Components/SceneComponent.h"
#include "GameFramework/Actor.h"

#include "Engine/World.h"
#include "Engine/Texture2D.h"
#include "Engine/GameInstance.h"
#include "NavigationSystem.h"
#include "NavigationPath.h"
#include "NavigationData.h"
#include "DrawDebugHelpers.h"

static TAutoConsoleVariable<int32> CVarSlimeFaceDbg(
	TEXT("chuck.slime.facedbg"), 0,
	TEXT("Draw slime movement-direction arrows (1) to compare against billboard facing."),
	ECVF_Default);

static TAutoConsoleVariable<int32> CVarSlimeRowFront(TEXT("chuck.slime.rowfront"), -1, TEXT("Override slime atlas front row (-1=def)."), ECVF_Default);
static TAutoConsoleVariable<int32> CVarSlimeRowSide (TEXT("chuck.slime.rowside"),  -1, TEXT("Override slime atlas side row (-1=def)."),  ECVF_Default);
static TAutoConsoleVariable<int32> CVarSlimeRowBack (TEXT("chuck.slime.rowback"),  -1, TEXT("Override slime atlas back row (-1=def)."),  ECVF_Default);
static TAutoConsoleVariable<int32> CVarSlimeSwapSide(TEXT("chuck.slime.swapside"), -1, TEXT("Override slime side flip 0/1 (-1=def)."),    ECVF_Default);

namespace
{
	const TCHAR* SlimeTexPath = TEXT("/Game/NPC/Slime/T_SlimeCrawl.T_SlimeCrawl");
}

void UchuckSlimeSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
}

void UchuckSlimeSubsystem::Deinitialize()
{
	Slimes.Reset();
	Paths.Reset();
	SlimeSprites.Reset();
	ClientSprites.Reset();
	HitProxies.Reset();
	HitProxySlime.Reset();
	if (HitProxyHost)
	{
		HitProxyHost->Destroy();
		HitProxyHost = nullptr;
	}
	SlimeDef = nullptr;
	Super::Deinitialize();
}

TStatId UchuckSlimeSubsystem::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(UchuckSlimeSubsystem, STATGROUP_Tickables);
}

UKBVENpcSpriteRenderSubsystem* UchuckSlimeSubsystem::GetSpriteRenderer() const
{
	UWorld* World = GetWorld();
	return World ? World->GetSubsystem<UKBVENpcSpriteRenderSubsystem>() : nullptr;
}

void UchuckSlimeSubsystem::EnsureSpriteDef()
{
	if (SlimeDef)
	{
		return;
	}
	SlimeDef = NewObject<UKBVENpcSpriteDef>(this);
	SlimeDef->Ref = FName(TEXT("glass-slime"));
	SlimeDef->Atlas = LoadObject<UTexture2D>(nullptr, SlimeTexPath);
	SlimeDef->Columns = Cols;
	SlimeDef->Rows = Rows;
	SlimeDef->RowFront = 0;
	SlimeDef->RowSide = 1;
	SlimeDef->RowBack = 2;
	SlimeDef->bSwapSide = true;
	SlimeDef->FramesPerAnim = Cols;
	SlimeDef->Fps = FrameRate;
	SlimeDef->WorldSize = FVector2f(150.f, 150.f);
	SlimeDef->PivotZ = 0.12f;
	SlimeDef->CullDistance = 8000.f;
}

float UchuckSlimeSubsystem::GroundTraceZ(double X, double Y, float Fallback) const
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return Fallback;
	}
	const FVector Start(X, Y, Fallback + 1000.f);
	const FVector End(X, Y, Fallback - 5000.f);
	FHitResult Hit;
	FCollisionQueryParams Params;
	if (World->LineTraceSingleByChannel(Hit, Start, End, ECC_WorldStatic, Params))
	{
		return (float)Hit.ImpactPoint.Z;
	}
	return Fallback;
}

float UchuckSlimeSubsystem::GroundFootprintMinZ(double X, double Y, float Radius, float Fallback) const
{
	const float C = GroundTraceZ(X, Y, Fallback);
	float MinZ = C;
	MinZ = FMath::Min(MinZ, GroundTraceZ(X + Radius, Y, C));
	MinZ = FMath::Min(MinZ, GroundTraceZ(X - Radius, Y, C));
	MinZ = FMath::Min(MinZ, GroundTraceZ(X, Y + Radius, C));
	MinZ = FMath::Min(MinZ, GroundTraceZ(X, Y - Radius, C));
	return MinZ;
}

void UchuckSlimeSubsystem::Repath(int32 SlimeIndex, const FVector& From)
{
	if (!Paths.IsValidIndex(SlimeIndex))
	{
		return;
	}
	TArray<FVector>& P = Paths[SlimeIndex];
	P.Reset();

	UWorld* World = GetWorld();
	const float WanderAngle = FMath::FRandRange(0.f, 2.f * PI);
	const float WanderDist = FMath::FRandRange(300.f, 700.f);
	FVector Target = From + FVector(FMath::Cos(WanderAngle) * WanderDist, FMath::Sin(WanderAngle) * WanderDist, 0.f);

	if (UNavigationSystemV1* Nav = FNavigationSystem::GetCurrent<UNavigationSystemV1>(World))
	{
		FNavLocation Proj;
		if (Nav->ProjectPointToNavigation(Target, Proj, FVector(400.f, 400.f, 800.f)))
		{
			Target = Proj.Location;
		}
		if (UNavigationPath* Path = Nav->FindPathToLocationSynchronously(World, From, Target))
		{
			if (Path->IsValid() && Path->PathPoints.Num() > 1)
			{
				for (const FVector& Pt : Path->PathPoints)
				{
					P.Add(Pt);
				}
			}
		}
	}

	if (P.Num() == 0)
	{
		P.Add(Target);
	}
}

void UchuckSlimeSubsystem::SpawnSlimes(const FVector& Center, int32 Count, float Radius)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}
	if (World->GetNetMode() == NM_Client)
	{
		return;
	}
	EnsureReplicator(true);
	UMassEntitySubsystem* MassSys = World->GetSubsystem<UMassEntitySubsystem>();
	if (!MassSys)
	{
		return;
	}

	if (UNavigationSystemV1* Nav = FNavigationSystem::GetCurrent<UNavigationSystemV1>(World))
	{
		Nav->Build();
	}

	EnsureSpriteDef();
	UKBVENpcSpriteRenderSubsystem* Renderer = GetSpriteRenderer();

	FMassEntityManager& EM = MassSys->GetMutableEntityManager();

	if (!Archetype.IsValid())
	{
		const TArray<const UScriptStruct*> Composition = {
			FTransformFragment::StaticStruct(),
			FchuckSlimeFragment::StaticStruct(),
			FKBVEStatFragment::StaticStruct(),
			FchuckSlimeTag::StaticStruct()
		};
		Archetype = EM.CreateArchetype(Composition);
	}

	FKBVENpcStats SlimeStats;
	bool bHaveStats = false;
	if (UGameInstance* GI = World->GetGameInstance())
	{
		if (UKBVENpcDatabase* NpcDB = GI->GetSubsystem<UKBVENpcDatabase>())
		{
			FKBVENpcDef Def;
			if (NpcDB->GetNpcByRef(FName(TEXT("glass-slime")), Def))
			{
				SlimeStats = Def.Stats;
				bHaveStats = true;
				UE_LOG(LogTemp, Display, TEXT("[chuck] slime stats from NPCDB: HP=%.0f Atk=%.0f Def=%.0f Spd=%.1f"),
					SlimeStats.HP, SlimeStats.Attack, SlimeStats.Defense, SlimeStats.Speed);
			}
		}
	}

	for (int32 i = 0; i < Count; ++i)
	{
		const float Angle = FMath::FRandRange(0.f, 2.f * PI);
		const float R = Radius * FMath::Sqrt(FMath::FRand());
		const double X = Center.X + FMath::Cos(Angle) * R;
		const double Y = Center.Y + FMath::Sin(Angle) * R;
		const float GroundZ = GroundTraceZ(X, Y, (float)Center.Z);

		const FMassEntityHandle E = EM.CreateEntity(Archetype);
		FTransformFragment* T = EM.GetFragmentDataPtr<FTransformFragment>(E);
		FchuckSlimeFragment* S = EM.GetFragmentDataPtr<FchuckSlimeFragment>(E);
		if (!T || !S)
		{
			continue;
		}

		const FVector Pos(X, Y, GroundZ);
		T->GetMutableTransform().SetLocation(Pos);

		S->GroundZ = GroundZ;
		S->TargetLocation = FVector(X, Y, GroundZ);
		S->LastYaw = FMath::FRandRange(-180.f, 180.f);
		FKBVEStatFragment* StatF = EM.GetFragmentDataPtr<FKBVEStatFragment>(E);
		if (bHaveStats)
		{
			constexpr float SpeedToUU = 40.f;
			S->Speed = FMath::Max(40.f, SlimeStats.Speed * SpeedToUU) * FMath::FRandRange(0.9f, 1.1f);
			S->HP = SlimeStats.HP;
			S->MaxHP = SlimeStats.MaxHP;
			S->Attack = SlimeStats.Attack;
			S->Defense = SlimeStats.Defense;
		}
		if (StatF)
		{
			StatF->MaxHealth = bHaveStats ? FMath::Max(1.f, SlimeStats.MaxHP) : 20.f;
			StatF->Health = StatF->MaxHealth;
			StatF->HealthRegenPerSec = 0.f;
		}
		else
		{
			S->Speed = FMath::FRandRange(110.f, 170.f);
		}
		S->HopPhase = FMath::FRand() * 2.f * PI;

		FKBVENpcSpriteHandle H;
		if (Renderer && SlimeDef)
		{
			H = Renderer->SpawnSprite(SlimeDef, Pos, 0.f);
		}
		SlimeSprites.Add(H);
		Slimes.Add(E);
		Paths.Add(TArray<FVector>());
	}

	UE_LOG(LogTemp, Display, TEXT("[chuck] Mass slimes spawned: %d (total %d)"), Count, Slimes.Num());
}

UKBVENetEntityReplicator* UchuckSlimeSubsystem::EnsureReplicator(bool bAuthority)
{
	if (NetActor.IsValid())
	{
		return NetActor->GetReplicator();
	}
	UWorld* World = GetWorld();
	if (!World)
	{
		return nullptr;
	}
	if (bAuthority)
	{
		FActorSpawnParameters Params;
		Params.ObjectFlags |= RF_Transient;
		AchuckSlimeNetActor* Spawned = World->SpawnActor<AchuckSlimeNetActor>(
			AchuckSlimeNetActor::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, Params);
		NetActor = Spawned;
		return Spawned ? Spawned->GetReplicator() : nullptr;
	}
	for (TActorIterator<AchuckSlimeNetActor> It(World); It; ++It)
	{
		NetActor = *It;
		return It->GetReplicator();
	}
	return nullptr;
}

void UchuckSlimeSubsystem::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	if (World->GetNetMode() == NM_Client)
	{
		TickClientRender();
	}
	else
	{
		TickServer(DeltaTime);
	}
}

void UchuckSlimeSubsystem::TickServer(float DeltaTime)
{
	if (Slimes.Num() == 0)
	{
		return;
	}
	UWorld* World = GetWorld();
	UMassEntitySubsystem* MassSys = World ? World->GetSubsystem<UMassEntitySubsystem>() : nullptr;
	if (!MassSys)
	{
		return;
	}
	FMassEntityManager& EM = MassSys->GetMutableEntityManager();
	UKBVENetEntityReplicator* Rep = EnsureReplicator(true);
	UKBVENpcSpriteRenderSubsystem* Renderer = GetSpriteRenderer();

	if (Renderer && SlimeDef)
	{
		const int32 RF = CVarSlimeRowFront.GetValueOnGameThread();
		const int32 RS = CVarSlimeRowSide.GetValueOnGameThread();
		const int32 RB = CVarSlimeRowBack.GetValueOnGameThread();
		const int32 SW = CVarSlimeSwapSide.GetValueOnGameThread();
		if (RF >= 0 || RS >= 0 || RB >= 0 || SW >= 0)
		{
			Renderer->DebugSetCellParams(SlimeDef,
				RF >= 0 ? (float)RF : -1.f,
				RS >= 0 ? (float)RS : -1.f,
				RB >= 0 ? (float)RB : -1.f,
				SW >= 0 ? (float)SW : -1.f);
		}
	}

	int32 RepathBudget = 4;

	FVector PlayerLoc = FVector::ZeroVector;
	FVector CamLoc = FVector::ZeroVector;
	bool bHavePlayer = false;
	if (APlayerController* PC = World->GetFirstPlayerController())
	{
		if (APawn* Pn = PC->GetPawn())
		{
			PlayerLoc = Pn->GetActorLocation();
			bHavePlayer = true;
		}
		if (PC->PlayerCameraManager)
		{
			CamLoc = PC->PlayerCameraManager->GetCameraLocation();
		}
	}
	const double RelevanceRadiusSq = 8500.0 * 8500.0;

	for (int32 i = 0; i < Slimes.Num(); ++i)
	{
		const FMassEntityHandle E = Slimes[i];
		if (!EM.IsEntityValid(E))
		{
			continue;
		}
		FTransformFragment* T = EM.GetFragmentDataPtr<FTransformFragment>(E);
		FchuckSlimeFragment* S = EM.GetFragmentDataPtr<FchuckSlimeFragment>(E);
		if (!T || !S)
		{
			continue;
		}

		if (S->bDead)
		{
			continue;
		}
		if (FKBVEStatFragment* StatF = EM.GetFragmentDataPtr<FKBVEStatFragment>(E))
		{
			if (StatF->Health <= 0.f)
			{
				S->bDead = 1;
				if (Renderer && SlimeSprites.IsValidIndex(i))
				{
					Renderer->DespawnSprite(SlimeSprites[i]);
				}
				continue;
			}
		}

		FVector Pos = T->GetTransform().GetLocation();
		const bool bRelevant = !bHavePlayer || FVector::DistSquaredXY(Pos, PlayerLoc) <= RelevanceRadiusSq;

		S->RepathTimer -= DeltaTime;
		TArray<FVector>& P = Paths[i];
		if (P.Num() == 0 || S->PathIndex >= P.Num() || S->RepathTimer <= 0.f)
		{
			const float WA = FMath::FRandRange(0.f, 2.f * PI);
			const float WD = FMath::FRandRange(300.f, 700.f);
			P.Reset();
			P.Add(Pos + FVector(FMath::Cos(WA) * WD, FMath::Sin(WA) * WD, 0.f));
			S->PathIndex = 0;
			S->RepathTimer = FMath::FRandRange(3.f, 6.f);

			if (bRelevant && RepathBudget > 0)
			{
				--RepathBudget;
				Repath(i, Pos);
				S->PathIndex = (P.Num() > 1) ? 1 : 0;
			}
		}

		FVector Waypoint = P.IsValidIndex(S->PathIndex) ? P[S->PathIndex] : Pos;
		FVector Dir = Waypoint - Pos;
		Dir.Z = 0.f;
		double Flat = Dir.Size();
		if (Flat < 50.0 && S->PathIndex < P.Num())
		{
			++S->PathIndex;
			Waypoint = P.IsValidIndex(S->PathIndex) ? P[S->PathIndex] : Pos;
			Dir = Waypoint - Pos;
			Dir.Z = 0.f;
			Flat = Dir.Size();
		}
		const bool bMoving = Flat > 20.0 && S->PathIndex < P.Num();

		float MoveYaw = S->LastYaw;
		if (bMoving)
		{
			Dir /= Flat;
			MoveYaw = FMath::RadiansToDegrees(FMath::Atan2(Dir.Y, Dir.X));

			const float TurnDelta = FMath::Abs(FMath::FindDeltaAngleDegrees(S->LastYaw, MoveYaw));
			if (TurnDelta > 45.f && S->TurnTimer <= 0.f)
			{
				S->TurnTimer = 0.35f;
			}
			S->LastYaw = MoveYaw;

			S->HopPhase += DeltaTime * HopRate;
			const float HopUp = FMath::Max(0.f, FMath::Sin(S->HopPhase));

			FVector NewPos = Pos;
			if (S->TurnTimer > 0.f)
			{
				S->TurnTimer -= DeltaTime;
			}
			else
			{
				NewPos = Pos + Dir * S->Speed * DeltaTime * HopUp * HopMoveScale;
			}
			S->GroundTimer -= DeltaTime;
			if (S->GroundTimer <= 0.f)
			{
				S->GroundZ = GroundFootprintMinZ(NewPos.X, NewPos.Y, FootprintRadius, S->GroundZ);
				S->GroundTimer = FMath::FRandRange(0.18f, 0.30f);
			}
			NewPos.Z = S->GroundZ + HopUp * HopAmp;
			T->GetMutableTransform().SetLocation(NewPos);
			Pos = NewPos;
		}
		else
		{
			Pos.Z = S->GroundZ;
			T->GetMutableTransform().SetLocation(Pos);
		}

		if (Renderer && SlimeSprites.IsValidIndex(i) && bRelevant)
		{
			Renderer->UpdateSprite(SlimeSprites[i], Pos, MoveYaw);
		}

		if (bRelevant && CVarSlimeFaceDbg.GetValueOnGameThread() != 0)
		{
			if (UWorld* W = GetWorld())
			{
				const float Rad = FMath::DegreesToRadians(MoveYaw);
				const FVector Fwd(FMath::Cos(Rad), FMath::Sin(Rad), 0.f);
				const FVector Base = Pos + FVector(0.f, 0.f, 90.f);
				DrawDebugDirectionalArrow(W, Base, Base + Fwd * 160.f, 40.f,
					bMoving ? FColor::Green : FColor::Yellow, false, -1.f, 0, 4.f);

				FVector ToCam = CamLoc - Pos;
				ToCam.Z = 0.f;
				const float CamYaw = FMath::RadiansToDegrees(FMath::Atan2(ToCam.Y, ToCam.X));
				const float D = FMath::FindDeltaAngleDegrees(CamYaw, MoveYaw);
				const float AD = FMath::Abs(D);

				const float SwapSide = SlimeDef ? (SlimeDef->bSwapSide ? 1.f : 0.f) : 0.f;
				const float Right = (D < 0.f) ? 1.f : 0.f;
				const bool bFlip = (Right != SwapSide);

				FString Move;
				FString Shows;
				if (AD >= 135.f) { Move = TEXT("AWAY"); Shows = TEXT("BACK"); }
				else if (AD > 45.f)
				{
					Move = (D < 0.f) ? TEXT("LEFT") : TEXT("RIGHT");
					Shows = bFlip ? TEXT("RIGHT(flip)") : TEXT("LEFT(base)");
				}
				else { Move = TEXT("TOWARD"); Shows = TEXT("FRONT"); }

				const FString Cell = FString::Printf(TEXT("move:%s  sprite:%s"), *Move, *Shows);
				DrawDebugString(W, Pos + FVector(0.f, 0.f, 150.f), Cell, nullptr, FColor::Cyan, 0.f, true);
			}
		}

		if (Rep && bRelevant)
		{
			S->UpsertTimer -= DeltaTime;
			if (S->bInCombat || S->UpsertTimer <= 0.f)
			{
				Rep->ServerUpsert(static_cast<uint32>(i), Pos, MoveYaw, 0, bMoving ? 1 : 0);
				S->UpsertTimer = S->bInCombat ? 0.f : FMath::FRandRange(0.35f, 0.55f);
			}
		}
	}

	if (bHavePlayer)
	{
		UpdateHitProxies(PlayerLoc);
	}
}

void UchuckSlimeSubsystem::UpdateHitProxies(const FVector& PlayerLoc)
{
	UWorld* World = GetWorld();
	UMassEntitySubsystem* MassSys = World ? World->GetSubsystem<UMassEntitySubsystem>() : nullptr;
	if (!MassSys)
	{
		return;
	}

	if (!HitProxyHost)
	{
		FActorSpawnParameters Params;
		Params.ObjectFlags |= RF_Transient;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		HitProxyHost = World->SpawnActor<AActor>(AActor::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, Params);
		if (HitProxyHost)
		{
			USceneComponent* Root = NewObject<USceneComponent>(HitProxyHost, TEXT("Root"), RF_Transient);
			HitProxyHost->SetRootComponent(Root);
			Root->RegisterComponent();
		}
	}
	if (!HitProxyHost)
	{
		return;
	}

	for (int32 i = HitProxies.Num(); i < MaxHitProxies; ++i)
	{
		USphereComponent* Proxy = NewObject<USphereComponent>(HitProxyHost, NAME_None, RF_Transient);
		Proxy->SetupAttachment(HitProxyHost->GetRootComponent());
		Proxy->InitSphereRadius(HitProxyRadius);
		Proxy->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Proxy->SetCollisionObjectType(ECC_WorldDynamic);
		Proxy->SetCollisionResponseToAllChannels(ECR_Ignore);
		Proxy->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);
		Proxy->SetCanEverAffectNavigation(false);
		Proxy->ComponentTags.Add(TEXT("SlimeHit"));
		Proxy->RegisterComponent();
		HitProxies.Add(Proxy);
		HitProxySlime.Add(INDEX_NONE);
	}

	FMassEntityManager& EM = MassSys->GetMutableEntityManager();
	const double RangeSq = static_cast<double>(HitProxyRange) * HitProxyRange;

	TArray<TPair<double, int32>> Near;
	Near.Reserve(MaxHitProxies * 2);
	for (int32 i = 0; i < Slimes.Num(); ++i)
	{
		const FMassEntityHandle E = Slimes[i];
		if (!EM.IsEntityValid(E))
		{
			continue;
		}
		const FchuckSlimeFragment* S = EM.GetFragmentDataPtr<FchuckSlimeFragment>(E);
		const FTransformFragment* T = EM.GetFragmentDataPtr<FTransformFragment>(E);
		if (!S || !T || S->bDead)
		{
			continue;
		}
		const double DistSq = FVector::DistSquaredXY(T->GetTransform().GetLocation(), PlayerLoc);
		if (DistSq <= RangeSq)
		{
			Near.Emplace(DistSq, i);
		}
	}
	Near.Sort([](const TPair<double, int32>& A, const TPair<double, int32>& B) { return A.Key < B.Key; });

	const int32 Assigned = FMath::Min(Near.Num(), MaxHitProxies);
	for (int32 p = 0; p < Assigned; ++p)
	{
		const int32 Idx = Near[p].Value;
		const FTransformFragment* T = EM.GetFragmentDataPtr<FTransformFragment>(Slimes[Idx]);
		USphereComponent* Proxy = HitProxies[p];
		Proxy->SetWorldLocation(T->GetTransform().GetLocation() + FVector(0.f, 0.f, HitProxyCenterZ));
		Proxy->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
		HitProxySlime[p] = Idx;
	}
	for (int32 p = Assigned; p < HitProxies.Num(); ++p)
	{
		HitProxies[p]->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		HitProxySlime[p] = INDEX_NONE;
	}
}

void UchuckSlimeSubsystem::TickClientRender()
{
	UKBVENetEntityReplicator* Rep = EnsureReplicator(false);
	if (!Rep)
	{
		return;
	}
	UKBVENpcSpriteRenderSubsystem* Renderer = GetSpriteRenderer();
	if (!Renderer)
	{
		return;
	}
	EnsureSpriteDef();

	const TArray<FKBVENetEntitySnapshot>& Snaps = Rep->GetSnapshots();
	TSet<uint32> Seen;
	Seen.Reserve(Snaps.Num());

	for (const FKBVENetEntitySnapshot& Sn : Snaps)
	{
		Seen.Add(Sn.Id);
		const FVector Pos = Sn.Location;
		const float Yaw = Sn.YawDegrees();
		if (FKBVENpcSpriteHandle* H = ClientSprites.Find(Sn.Id))
		{
			Renderer->UpdateSprite(*H, Pos, Yaw);
		}
		else if (SlimeDef)
		{
			ClientSprites.Add(Sn.Id, Renderer->SpawnSprite(SlimeDef, Pos, Yaw));
		}
	}

	for (auto It = ClientSprites.CreateIterator(); It; ++It)
	{
		if (!Seen.Contains(It.Key()))
		{
			Renderer->DespawnSprite(It.Value());
			It.RemoveCurrent();
		}
	}
}
