#include "SimgridEntityManager.h"
#include "SimgridEntityActor.h"
#include "SimgridWorldBridge.h"
#include "SimgridReconcile.h"
#include "SimgridClientSubsystem.h"
#include "SimgridCoords.h"
#include "KBVEMovementDriver.h"
#include "KBVESimgridRenderModule.h"
#include "KBVENpcSpriteRenderSubsystem.h"
#include "KBVENpcSpriteDef.h"
#include "Engine/World.h"
#include "Engine/Texture2D.h"
#include "Engine/SkeletalMesh.h"
#include "Animation/AnimationAsset.h"

static constexpr uint8 KBVE_CAT_PLAYER = 0;
static constexpr uint8 KBVE_CAT_ENV = 3;

static bool ResolveKindCat(const TArray<FSimgridKindEntry>& Reg, uint16 Kind, uint8& OutCat, FString& OutRef)
{
	for (const FSimgridKindEntry& K : Reg)
	{
		if (K.Kind == Kind)
		{
			OutCat = K.Cat;
			OutRef = K.RefId;
			return true;
		}
	}
	return false;
}

void USimgridEntityManager::Setup(UWorld* World, USimgridClientSubsystem* Subsystem, USimgridWorldBridge* Bridge, UStaticMesh* DefaultMesh)
{
	WorldPtr = World;
	Sub = Subsystem;
	WorldBridge = Bridge;
	DefaultMeshAsset = DefaultMesh;

	if (Sub)
	{
		Sub->OnSnapshot.RemoveDynamic(this, &USimgridEntityManager::OnSnapshotReceived);
		Sub->OnSnapshot.AddDynamic(this, &USimgridEntityManager::OnSnapshotReceived);
	}
}

void USimgridEntityManager::BeginDestroy()
{
	if (Sub)
	{
		Sub->OnSnapshot.RemoveDynamic(this, &USimgridEntityManager::OnSnapshotReceived);
	}
	Super::BeginDestroy();
}

void USimgridEntityManager::OnSnapshotReceived()
{
	if (Sub)
	{
		const FSimgridSnapshot& Snap = Sub->GetLastSnapshot();
		for (const FSimgridPlayerView& P : Snap.Players)
		{
			if (P.bConnected && !P.Username.IsEmpty())
			{
				SlotNames.Add(P.Slot, P.Username);
			}
		}
		Interp.Push(Snap);
	}
}

FString USimgridEntityManager::NameForSlot(uint16 Slot) const
{
	const FString* Found = SlotNames.Find(Slot);
	return Found ? *Found : FString();
}

FVector USimgridEntityManager::ResolveWorldPos(const FSimgridInterpState& S) const
{
	const float Height = WorldBridge ? WorldBridge->SampleHeight((float)S.WorldXY.X, (float)S.WorldXY.Y) : 0.0f;
	const float Z = Height + (float)S.Z * FSimgridCoords::FLOOR_HEIGHT;
	return FVector(S.WorldXY.X, S.WorldXY.Y, Z);
}

ASimgridEntityActor* USimgridEntityManager::SpawnActor(uint16 Kind)
{
	UWorld* World = WorldPtr.Get();
	if (!World)
	{
		return nullptr;
	}

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	ASimgridEntityActor* Actor = World->SpawnActor<ASimgridEntityActor>(ASimgridEntityActor::StaticClass(), FTransform::Identity, Params);
	if (Actor)
	{
		Actor->SetMesh(DefaultMeshAsset);
	}
	return Actor;
}

UKBVENpcSpriteRenderSubsystem* USimgridEntityManager::GetSpriteRenderer() const
{
	UWorld* World = WorldPtr.Get();
	return World ? World->GetSubsystem<UKBVENpcSpriteRenderSubsystem>() : nullptr;
}

void USimgridEntityManager::EnsureEnvDef()
{
	if (EnvDef)
	{
		return;
	}
	EnvDef = NewObject<UKBVENpcSpriteDef>(this);
	EnvDef->Ref = FName(TEXT("env-placeholder"));
	EnvDef->Atlas = LoadObject<UTexture2D>(nullptr, TEXT("/Game/NPC/Slime/T_SlimeCrawl.T_SlimeCrawl"));
	EnvDef->Columns = 5;
	EnvDef->Rows = 3;
	EnvDef->RowFront = 0;
	EnvDef->RowSide = 1;
	EnvDef->RowBack = 2;
	EnvDef->bSwapSide = true;
	EnvDef->FramesPerAnim = 5;
	EnvDef->Fps = 8.0f;
	EnvDef->WorldSize = FVector2f(220.0f, 320.0f);
	EnvDef->PivotZ = 0.0f;
	EnvDef->CullDistance = 12000.0f;
}

UKBVENpcSpriteDef* USimgridEntityManager::EnsureTreeDef()
{
	if (TreeDef)
	{
		return TreeDef;
	}
	UTexture2D* Atlas = LoadObject<UTexture2D>(nullptr, TEXT("/Game/Art/Foliage/T_Trees01.T_Trees01"));
	if (!Atlas)
	{
		if (!bTreeAtlasWarned)
		{
			bTreeAtlasWarned = true;
			UE_LOG(LogKBVESimgridRender, Warning, TEXT("Tree atlas /Game/Art/Foliage/T_Trees01 missing — trees fall back to env placeholder sprite."));
		}
		return nullptr;
	}
	TreeDef = NewObject<UKBVENpcSpriteDef>(this);
	TreeDef->Ref = FName(TEXT("tree"));
	TreeDef->Atlas = Atlas;
	TreeDef->bStaticCell = true;
	TreeDef->Columns = 10;
	TreeDef->Rows = 14;
	TreeDef->WorldSize = FVector2f(300.0f, 600.0f);
	TreeDef->PivotZ = 0.0f;
	TreeDef->CullDistance = 12000.0f;
	return TreeDef;
}

static int32 TreeCellFromSub(uint8 SubByte)
{
	const int32 Variant = (SubByte & 0x7F) % 70;
	return (SubByte & 0x80) ? Variant + 70 : Variant;
}

USkeletalMesh* USimgridEntityManager::EnsureMannyMesh()
{
	if (!MannyMesh)
	{
		MannyMesh = LoadObject<USkeletalMesh>(nullptr, TEXT("/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple.SKM_Manny_Simple"));
	}
	return MannyMesh;
}

void USimgridEntityManager::EnsureLocomotionAnims()
{
	if (bAnimsLoaded)
	{
		return;
	}
	bAnimsLoaded = true;
	IdleAnim = LoadObject<UAnimationAsset>(nullptr, TEXT("/Game/Characters/Mannequins/Anims/Unarmed/MM_Idle.MM_Idle"));
	WalkAnim = LoadObject<UAnimationAsset>(nullptr, TEXT("/Game/Characters/Mannequins/Anims/Unarmed/Walk/MF_Unarmed_Walk_Fwd.MF_Unarmed_Walk_Fwd"));
	JogAnim = LoadObject<UAnimationAsset>(nullptr, TEXT("/Game/Characters/Mannequins/Anims/Unarmed/Jog/MF_Unarmed_Jog_Fwd.MF_Unarmed_Jog_Fwd"));
}

UAnimationAsset* USimgridEntityManager::PickLocomotionAnim(float Speed)
{
	EnsureLocomotionAnims();
	if (Speed < 40.0f)
	{
		return IdleAnim;
	}
	if (Speed < 500.0f)
	{
		return WalkAnim ? WalkAnim : JogAnim;
	}
	return JogAnim ? JogAnim : WalkAnim;
}

void USimgridEntityManager::Tick(double NowMs)
{
	if (!Interp.HasData())
	{
		return;
	}

	const double RenderTime = NowMs - FSimgridInterpolator::INTERP_DELAY_MS;
	const TArray<FSimgridEntityDelta>& Keyframe = Interp.LatestEntities();

	bHasLocalPos = false;

	for (const FSimgridEntityDelta& E : Keyframe)
	{
		FSimgridInterpState S;
		if (!Interp.SampleEntity(E.Eid, RenderTime, S))
		{
			continue;
		}

		const FVector WorldPos = ResolveWorldPos(S);
		const float Yaw = FSimgridCoords::FacingToYaw(S.Facing);

		const bool bIsLocal = (LocalSlot >= 0) && ((int32)S.Owner == LocalSlot) && (S.MaxHp > 0);
		if (bIsLocal)
		{
			bHasLocalPos = true;
			LocalWorldPos = WorldPos;
			LocalPools.Hp = E.Hp;
			LocalPools.MaxHp = E.MaxHp;
			LocalPools.Mp = E.Mp;
			LocalPools.MaxMp = E.MaxMp;
			LocalPools.Energy = E.Energy;
			LocalPools.MaxEnergy = E.MaxEnergy;
			LocalPools.Stamina = E.Stamina;
			LocalPools.MaxStamina = E.MaxStamina;

			AActor* Pawn = LocalPawn.Get();
			if (!Pawn)
			{
				if (!bWarnedNoLocalPawn)
				{
					bWarnedNoLocalPawn = true;
					UE_LOG(LogKBVESimgridRender, Error, TEXT("Local entity eid=%u slot=%d present in snapshot but LocalPawn is null — pawn unpositioned/invisible. SetLocalPawn never ran or possession failed."), E.Eid, LocalSlot);
				}
			}
			else if (IKBVEMovementDriver* Driver = Cast<IKBVEMovementDriver>(Pawn))
			{
				const FVector2D LatestXY = FSimgridCoords::QuantToWorldXY(E.Qx, E.Qy);
				const float LatestH = WorldBridge ? WorldBridge->SampleHeight((float)LatestXY.X, (float)LatestXY.Y) : 0.0f;
				const FVector LatestPos((float)LatestXY.X, (float)LatestXY.Y, LatestH + (float)E.Z * FSimgridCoords::FLOOR_HEIGHT);
				const FVector2D LatestVel = FSimgridCoords::QuantVelToWorldXY(E.Qvx, E.Qvy);
				Driver->ApplyServerCorrection(LatestPos, FVector(LatestVel.X, LatestVel.Y, 0.0f), E.InputAck);
			}
			else if (!bWarnedLocalNotDriver)
			{
				bWarnedLocalNotDriver = true;
				UE_LOG(LogKBVESimgridRender, Error, TEXT("LocalPawn %s does not implement IKBVEMovementDriver — cannot apply server correction; pawn stays at spawn."), *Pawn->GetName());
			}
			continue;
		}

		uint8 Cat = 0xFF;
		FString Ref;
		const bool bResolved = Sub && ResolveKindCat(Sub->GetRegistry(), S.Kind, Cat, Ref);
		if (bResolved && Cat == KBVE_CAT_ENV)
		{
			if (UKBVENpcSpriteRenderSubsystem* R = GetSpriteRenderer())
			{
				UKBVENpcSpriteDef* Def = nullptr;
				int32 Cell = 0;
				if (Ref == TEXT("tree"))
				{
					Def = EnsureTreeDef();
					Cell = TreeCellFromSub(E.Sub);
				}
				if (!Def)
				{
					EnsureEnvDef();
					Def = EnvDef;
				}
				if (int32* Id = SpriteHandleIds.Find(E.Eid))
				{
					FKBVENpcSpriteHandle H;
					H.Id = *Id;
					R->UpdateSprite(H, WorldPos, Yaw);
					if (Def->bStaticCell)
					{
						uint8* Applied = EnvSubApplied.Find(E.Eid);
						if (!Applied || *Applied != E.Sub)
						{
							R->SetSpriteCell(H, Cell);
							EnvSubApplied.Add(E.Eid, E.Sub);
						}
					}
				}
				else
				{
					const FKBVENpcSpriteHandle H = R->SpawnSprite(Def, WorldPos, Yaw, Cell);
					SpriteHandleIds.Add(E.Eid, H.Id);
					if (Def->bStaticCell)
					{
						EnvSubApplied.Add(E.Eid, E.Sub);
					}
				}
				continue;
			}
		}

		TObjectPtr<ASimgridEntityActor>* Found = Actors.Find(E.Eid);
		ASimgridEntityActor* Actor = Found ? Found->Get() : nullptr;
		if (!Actor)
		{
			Actor = SpawnActor(S.Kind);
			if (!Actor)
			{
				continue;
			}
			Actors.Add(E.Eid, Actor);
			if (bResolved && Cat == KBVE_CAT_PLAYER)
			{
				Actor->SetSkeletalMesh(EnsureMannyMesh());
			}
		}
		Actor->ApplyState(WorldPos, Yaw, S.Kind);
		if (bResolved && Cat == KBVE_CAT_PLAYER)
		{
			Actor->SetDisplayName(NameForSlot(S.Owner));
			Actor->SetBar(ESimgridNameplateBar::Health, (float)S.Hp, (float)S.MaxHp);
			Actor->SetBar(ESimgridNameplateBar::Mana, (float)S.Mp, (float)S.MaxMp);
			Actor->SetBar(ESimgridNameplateBar::Energy, (float)S.Energy, (float)S.MaxEnergy);
			Actor->SetBar(ESimgridNameplateBar::Stamina, (float)S.Stamina, (float)S.MaxStamina);
			Actor->SetLocomotionAnim(PickLocomotionAnim((float)S.VelXY.Size()));
		}
	}

	TSet<uint32> Live;
	Actors.GetKeys(Live);
	{
		TArray<uint32> SpriteKeys;
		SpriteHandleIds.GetKeys(SpriteKeys);
		for (const uint32 K : SpriteKeys)
		{
			Live.Add(K);
		}
	}

	TSet<uint32> Gone = FSimgridReconcile::DespawnSet(Live, Keyframe);
	Gone.Append(FSimgridReconcile::DestroyedIds(Keyframe));

	UKBVENpcSpriteRenderSubsystem* Renderer = GetSpriteRenderer();
	for (const uint32 Eid : Gone)
	{
		if (TObjectPtr<ASimgridEntityActor>* Found = Actors.Find(Eid))
		{
			if (ASimgridEntityActor* Actor = Found->Get())
			{
				Actor->Destroy();
			}
			Actors.Remove(Eid);
		}
		if (int32* Id = SpriteHandleIds.Find(Eid))
		{
			if (Renderer)
			{
				FKBVENpcSpriteHandle H;
				H.Id = *Id;
				Renderer->DespawnSprite(H);
			}
			SpriteHandleIds.Remove(Eid);
			EnvSubApplied.Remove(Eid);
		}
	}
}

bool USimgridEntityManager::WorldPosOf(uint32 Eid, FVector& OutPos) const
{
	if (const TObjectPtr<ASimgridEntityActor>* Found = Actors.Find(Eid))
	{
		if (const ASimgridEntityActor* Actor = Found->Get())
		{
			OutPos = Actor->GetActorLocation();
			return true;
		}
	}
	return false;
}

bool USimgridEntityManager::IsLocalWorldPos(FVector& OutPos) const
{
	OutPos = LocalWorldPos;
	return bHasLocalPos;
}

void USimgridEntityManager::Clear()
{
	for (TPair<uint32, TObjectPtr<ASimgridEntityActor>>& Pair : Actors)
	{
		if (ASimgridEntityActor* Actor = Pair.Value.Get())
		{
			Actor->Destroy();
		}
	}
	Actors.Empty();

	if (UKBVENpcSpriteRenderSubsystem* Renderer = GetSpriteRenderer())
	{
		for (const TPair<uint32, int32>& P : SpriteHandleIds)
		{
			FKBVENpcSpriteHandle H;
			H.Id = P.Value;
			Renderer->DespawnSprite(H);
		}
	}
	SpriteHandleIds.Empty();
	EnvSubApplied.Empty();
	SlotNames.Empty();

	bHasLocalPos = false;
}
