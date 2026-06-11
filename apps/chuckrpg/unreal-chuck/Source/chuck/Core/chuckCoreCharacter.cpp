#include "chuckCoreCharacter.h"

#include "Animation/AnimInstance.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "EnhancedInputComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/World.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "InputAction.h"
#include "NavigationInvokerComponent.h"
#include "MassCommonTypes.h"
#include "MassEntityManager.h"
#include "MassEntitySubsystem.h"
#include "Net/UnrealNetwork.h"
#include "UObject/ConstructorHelpers.h"

#include "chuckCharacterMovementComponent.h"
#include "KBVEAbilityComponent.h"
#include "KBVEDroppedItemPool.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "chuckEventPayloads.h"
#include "chuckInputs.h"
#include "chuckInventoryFragment.h"
#include "chuckItemDB.h"
#include "KBVEMovementState.h"
#include "KBVEStatFragment.h"
#include "KBVEStatIds.h"
#include "KBVEEffectComponent.h"
#include "KBVEGameplayTypes.h"
#include "chuckUIEvents.h"
#include "Engine/GameInstance.h"

AchuckCoreCharacter::AchuckCoreCharacter(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer.SetDefaultSubobjectClass<UchuckCharacterMovementComponent>(ACharacter::CharacterMovementComponentName))
{
	bReplicates = true;
	SetReplicateMovement(true);
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = true;

	EffectComp = CreateDefaultSubobject<UKBVEEffectComponent>(TEXT("EffectComp"));

	AbilityComp = CreateDefaultSubobject<UKBVEAbilityComponent>(TEXT("AbilityComp"));
	{
		FKBVEAbilityDef Melee;
		Melee.AbilityId = FName(TEXT("melee"));
		Melee.Damage = 25.f;
		Melee.Element = EKBVEDamageElement::Physical;
		Melee.Range = 180.f;
		Melee.Radius = 180.f;
		Melee.WindupSeconds = 0.1f;
		Melee.CooldownSeconds = 0.45f;
		Melee.EnergyCost = 10.f;
		AbilityComp->Abilities.Add(Melee);
	}

	static ConstructorHelpers::FObjectFinder<USkeletalMesh> SKM(
		TEXT("/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple.SKM_Manny_Simple"));
	static ConstructorHelpers::FClassFinder<UAnimInstance> AnimBP(
		TEXT("/Game/Characters/Mannequins/Anims/Unarmed/ABP_Unarmed"));

	if (USkeletalMeshComponent* MeshComp = GetMesh())
	{
		if (SKM.Succeeded())
		{
			MeshComp->SetSkeletalMesh(SKM.Object);
		}
		if (AnimBP.Succeeded())
		{
			MeshComp->SetAnimInstanceClass(AnimBP.Class);
		}
		MeshComp->SetRelativeLocation(FVector(0.f, 0.f, -90.f));
		MeshComp->SetRelativeRotation(FRotator(0.f, -90.f, 0.f));
		MeshComp->SetRenderCustomDepth(true);
		MeshComp->SetCustomDepthStencilValue(1);
	}

	UNavigationInvokerComponent* NavInvoker = CreateDefaultSubobject<UNavigationInvokerComponent>(TEXT("NavInvoker"));
	NavInvoker->SetGenerationRadii(6000.f, 8000.f);

	if (UCharacterMovementComponent* Move = GetCharacterMovement())
	{
		Move->MaxAcceleration               = 2048.f;
		Move->BrakingDecelerationWalking    = 1500.f;
		Move->GroundFriction                = 8.f;
		Move->JumpZVelocity                 = 500.f;
		Move->AirControl                    = 0.2f;
		Move->bOrientRotationToMovement     = true;
		Move->RotationRate                  = FRotator(0.f, 540.f, 0.f);
		Move->bUseControllerDesiredRotation = false;
		Move->NavAgentProps.bCanCrouch      = true;
	}

	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw   = false;
	bUseControllerRotationRoll  = false;

	if (USpringArmComponent* Boom = FindComponentByClass<USpringArmComponent>())
	{
		Boom->TargetArmLength          = ThirdPersonArmLength;
		Boom->bUsePawnControlRotation  = true;
		Boom->bEnableCameraLag         = true;
		Boom->bEnableCameraRotationLag = true;
		Boom->CameraLagSpeed           = 10.f;
		Boom->CameraRotationLagSpeed   = 15.f;
		Boom->CameraLagMaxDistance     = 50.f;
		Boom->SocketOffset             = FVector(0.f, 40.f, 60.f);
	}
}

UchuckCharacterMovementComponent* AchuckCoreCharacter::GetChuckMovement() const
{
	return Cast<UchuckCharacterMovementComponent>(GetCharacterMovement());
}

bool AchuckCoreCharacter::IsSprinting() const
{
	if (UchuckCharacterMovementComponent* CMC = GetChuckMovement())
	{
		return CMC->bWantsToSprint;
	}
	return false;
}

void AchuckCoreCharacter::PostInitializeComponents()
{
	Super::PostInitializeComponents();

	if (UchuckInputs* Inputs = UchuckInputs::Get())
	{
		JumpAction          = Inputs->Jump;
		MoveAction          = Inputs->Move;
		LookAction          = Inputs->Look;
		MouseLookAction     = Inputs->Look;
		SprintAction        = Inputs->Sprint;
		CrouchAction        = Inputs->Crouch;
		ToggleCameraAction  = Inputs->ToggleCamera;
		InventoryAction     = Inputs->Inventory;
		AttackAction        = Inputs->Attack;
	}

	Inventory.InitDefaults();
}

void AchuckCoreCharacter::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AchuckCoreCharacter, Stats);
	DOREPLIFETIME(AchuckCoreCharacter, Inventory);
}

void AchuckCoreCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (HasAuthority())
	{
		SyncStatsFragment(DeltaSeconds);
	}
}

void AchuckCoreCharacter::BeginPlay()
{
	Super::BeginPlay();

	if (EffectComp)
	{
		EffectComp->SetStatTarget(this);
	}

	UWorld* World = GetWorld();
	UGameInstance* GI = GetGameInstance();
	UchuckItemDB* DB = GI ? GI->GetSubsystem<UchuckItemDB>() : nullptr;
	UKBVEDroppedItemPool* Pool = World ? World->GetSubsystem<UKBVEDroppedItemPool>() : nullptr;
	if (DB && Pool)
	{
		Pool->SetVisualProvider(DB);
		if (!Pool->OnItemPickedUp.IsBound())
		{
			Pool->OnItemPickedUp.AddDynamic(DB, &UchuckItemDB::HandleDroppedItemPickedUp);
		}
	}

	if (HasAuthority())
	{
		CreateStatEntity();
		CreateInventoryEntity();
		SeedStarterItems();
	}
}

void AchuckCoreCharacter::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (HasAuthority())
	{
		DestroyStatEntity();
		DestroyInventoryEntity();
	}
	Super::EndPlay(EndPlayReason);
}

void AchuckCoreCharacter::CreateStatEntity()
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}
	UMassEntitySubsystem* Mass = World->GetSubsystem<UMassEntitySubsystem>();
	if (!Mass)
	{
		return;
	}

	FMassEntityManager& EntityManager = Mass->GetMutableEntityManager();

	TArray<const UScriptStruct*> FragmentTypes;
	FragmentTypes.Add(FKBVEStatFragment::StaticStruct());

	FMassArchetypeHandle Archetype = EntityManager.CreateArchetype(FragmentTypes);
	StatEntity = EntityManager.CreateEntity(Archetype);

	if (FKBVEStatFragment* Frag = EntityManager.GetFragmentDataPtr<FKBVEStatFragment>(StatEntity))
	{
		Frag->Health                    = Stats.Health;
		Frag->MaxHealth                 = Stats.MaxHealth;
		Frag->HealthRegenPerSec         = Stats.HealthRegenPerSec;
		Frag->Mana                      = Stats.Mana;
		Frag->MaxMana                   = Stats.MaxMana;
		Frag->ManaRegenPerSec           = Stats.ManaRegenPerSec;
		Frag->Energy                    = Stats.Energy;
		Frag->MaxEnergy                 = Stats.MaxEnergy;
		Frag->EnergyRegenPerSec         = Stats.EnergyRegenPerSec;
		Frag->Stamina                   = Stats.Stamina;
		Frag->MaxStamina                = Stats.MaxStamina;
		Frag->StaminaRegenPerSec        = Stats.StaminaRegenPerSec;
		Frag->StaminaSprintDrainPerSec  = Stats.StaminaSprintDrainPerSec;
		Frag->StaminaLowThreshold       = Stats.StaminaLowThreshold;
		Frag->StaminaLowRegenMultiplier = Stats.StaminaLowRegenMultiplier;
		Frag->StaminaEmptyPenaltySec    = Stats.StaminaEmptyPenaltySec;
		Frag->StaminaRegenDelay         = Stats.StaminaRegenDelay;
	}
}

void AchuckCoreCharacter::DestroyStatEntity()
{
	if (!StatEntity.IsValid())
	{
		return;
	}
	if (UWorld* World = GetWorld())
	{
		if (UMassEntitySubsystem* Mass = World->GetSubsystem<UMassEntitySubsystem>())
		{
			Mass->GetMutableEntityManager().DestroyEntity(StatEntity);
		}
	}
	StatEntity = FMassEntityHandle();
}

void AchuckCoreCharacter::SyncStatsFragment(float DeltaSeconds)
{
	TRACE_CPUPROFILER_EVENT_SCOPE(chuck_SyncStatsFragment);

	if (!StatEntity.IsValid())
	{
		return;
	}
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}
	UMassEntitySubsystem* Mass = World->GetSubsystem<UMassEntitySubsystem>();
	if (!Mass)
	{
		return;
	}

	FMassEntityManager& EM = Mass->GetMutableEntityManager();
	FKBVEStatFragment* Frag = EM.GetFragmentDataPtr<FKBVEStatFragment>(StatEntity);
	if (!Frag)
	{
		return;
	}

	UCharacterMovementComponent* Move = GetCharacterMovement();
	const bool bOnGround = Move && Move->IsMovingOnGround();
	const bool bFalling  = Move && Move->IsFalling();
	const bool bMoving   = bOnGround && Move->Velocity.SizeSquared2D() > 1.f;

	EKBVEMovementState State = EKBVEMovementState::None;
	KBVEMove::Assign(State, EKBVEMovementState::OnGround,  bOnGround);
	KBVEMove::Assign(State, EKBVEMovementState::InAir,     !bOnGround);
	KBVEMove::Assign(State, EKBVEMovementState::Falling,   bFalling);
	KBVEMove::Assign(State, EKBVEMovementState::Moving,    bMoving);
	KBVEMove::Assign(State, EKBVEMovementState::Sprinting, IsSprinting());
	KBVEMove::Assign(State, EKBVEMovementState::Crouching, bIsCrouched);
	Frag->MoveState = State;

	Stats.Health           = Frag->Health;
	Stats.Mana             = Frag->Mana;
	Stats.Energy           = Frag->Energy;
	Stats.Stamina          = Frag->Stamina;
	Stats.StaminaRegenDelay = Frag->StaminaRegenDelay;

	PublishStatChanges();

	if (IsSprinting() && Stats.StaminaRegenDelay > 0.f)
	{
		if (UchuckCharacterMovementComponent* CMC = GetChuckMovement())
		{
			CMC->bWantsToSprint = false;
		}
	}
}

void AchuckCoreCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PlayerInputComponent))
	{
		if (SprintAction)
		{
			EIC->BindAction(SprintAction, ETriggerEvent::Started,   this, &AchuckCoreCharacter::OnSprintPressed);
			EIC->BindAction(SprintAction, ETriggerEvent::Completed, this, &AchuckCoreCharacter::OnSprintReleased);
		}
		if (CrouchAction)
		{
			EIC->BindAction(CrouchAction, ETriggerEvent::Started, this, &AchuckCoreCharacter::OnCrouchPressed);
		}
		if (ToggleCameraAction)
		{
			EIC->BindAction(ToggleCameraAction, ETriggerEvent::Started, this, &AchuckCoreCharacter::OnToggleCameraPressed);
		}
		if (AttackAction)
		{
			EIC->BindAction(AttackAction, ETriggerEvent::Started, this, &AchuckCoreCharacter::OnAttackPressed);
		}
	}
}

void AchuckCoreCharacter::OnAttackPressed(const FInputActionValue& Value)
{
	const bool bOk = AbilityComp ? AbilityComp->TryActivate(FName(TEXT("melee"))) : false;
	UE_LOG(LogTemp, Warning, TEXT("[chuck] Attack pressed: comp=%d activated=%d auth=%d energy=%.0f"),
		AbilityComp != nullptr, bOk, HasAuthority(), Stats.Energy);
}

void AchuckCoreCharacter::OnSprintPressed(const FInputActionValue& Value)
{
	if (bIsCrouched)
	{
		return;
	}
	if (Stats.StaminaRegenDelay > 0.f)
	{
		return;
	}
	if (UchuckCharacterMovementComponent* CMC = GetChuckMovement())
	{
		CMC->bWantsToSprint = true;
	}
}

void AchuckCoreCharacter::OnSprintReleased(const FInputActionValue& Value)
{
	if (UchuckCharacterMovementComponent* CMC = GetChuckMovement())
	{
		CMC->bWantsToSprint = false;
	}
}

void AchuckCoreCharacter::OnCrouchPressed(const FInputActionValue& Value)
{
	if (bIsCrouched)
	{
		UnCrouch();
	}
	else
	{
		Crouch();
		if (UchuckCharacterMovementComponent* CMC = GetChuckMovement())
		{
			CMC->bWantsToSprint = false;
		}
	}
}

void AchuckCoreCharacter::OnToggleCameraPressed(const FInputActionValue& Value)
{
	bFirstPersonCamera = !bFirstPersonCamera;

	if (USpringArmComponent* Boom = FindComponentByClass<USpringArmComponent>())
	{
		Boom->TargetArmLength = bFirstPersonCamera ? 0.f : ThirdPersonArmLength;
	}
	if (USkeletalMeshComponent* MeshComp = GetMesh())
	{
		MeshComp->SetOwnerNoSee(bFirstPersonCamera);
	}
}

void AchuckCoreCharacter::CreateInventoryEntity()
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}
	UMassEntitySubsystem* Mass = World->GetSubsystem<UMassEntitySubsystem>();
	if (!Mass)
	{
		return;
	}

	FMassEntityManager& EM = Mass->GetMutableEntityManager();

	TArray<const UScriptStruct*> FragmentTypes;
	FragmentTypes.Add(FchuckInventoryFragment::StaticStruct());

	FMassArchetypeHandle Archetype = EM.CreateArchetype(FragmentTypes);
	InventoryEntity = EM.CreateEntity(Archetype);

	if (FchuckInventoryFragment* Frag = EM.GetFragmentDataPtr<FchuckInventoryFragment>(InventoryEntity))
	{
		FMemory::Memzero(Frag->Bag,    sizeof(Frag->Bag));
		FMemory::Memzero(Frag->Hotbar, sizeof(Frag->Hotbar));
		Frag->BagDirtyMask    = 0;
		Frag->HotbarDirtyMask = 0;
	}
}

void AchuckCoreCharacter::DestroyInventoryEntity()
{
	if (!InventoryEntity.IsValid())
	{
		return;
	}
	if (UWorld* World = GetWorld())
	{
		if (UMassEntitySubsystem* Mass = World->GetSubsystem<UMassEntitySubsystem>())
		{
			Mass->GetMutableEntityManager().DestroyEntity(InventoryEntity);
		}
	}
	InventoryEntity = FMassEntityHandle();
}

int32 AchuckCoreCharacter::ServerAddItemByKey(int32 ItemKey, int32 Count)
{
	if (!HasAuthority() || ItemKey <= 0 || Count <= 0)
	{
		return Count;
	}

	UGameInstance* GI = GetGameInstance();
	UchuckItemDB* DB = GI ? GI->GetSubsystem<UchuckItemDB>() : nullptr;
	if (!DB)
	{
		return Count;
	}
	const FKBVEItemDef* Def = DB->LookupByKey(ItemKey);
	if (!Def)
	{
		return Count;
	}

	const int32 MaxStack = Def->bStackable ? FMath::Max(Def->MaxStack, 1) : 1;
	int32 Leftover = chuckInventory::TryAdd(Inventory.DefaultBag, ItemKey, Count, MaxStack, Def->bStackable);

	UWorld* World = GetWorld();
	UMassEntitySubsystem* Mass = World ? World->GetSubsystem<UMassEntitySubsystem>() : nullptr;
	if (Mass && InventoryEntity.IsValid())
	{
		if (FchuckInventoryFragment* Frag = Mass->GetMutableEntityManager().GetFragmentDataPtr<FchuckInventoryFragment>(InventoryEntity))
		{
			const int32 BagN = FMath::Min(Inventory.DefaultBag.Slots.Num(), FchuckInventoryFragment::BagCapacity);
			for (int32 i = 0; i < BagN; ++i)
			{
				const FchuckInventoryStack& Src = Inventory.DefaultBag.Slots[i];
				FchuckInventorySlotPOD& Dst = Frag->Bag[i];
				Dst.ItemKey     = Src.ItemKey;
				Dst.Count       = Src.Count;
				Dst.Durability  = Src.Durability;
				Dst.Flags       = Src.Flags;
				Dst.InstanceIdx = Src.InstanceIdx;
			}
			Frag->BagDirtyMask = (BagN < 32) ? ((1u << BagN) - 1u) : ~0u;
		}
	}
	return Leftover;
}

int32 AchuckCoreCharacter::ServerAddItemByRef(FName Ref, int32 Count)
{
	UGameInstance* GI = GetGameInstance();
	UchuckItemDB* DB = GI ? GI->GetSubsystem<UchuckItemDB>() : nullptr;
	if (!DB)
	{
		return Count;
	}
	if (const FKBVEItemDef* Def = DB->LookupByRef(Ref))
	{
		return ServerAddItemByKey(Def->Key, Count);
	}
	return Count;
}

void AchuckCoreCharacter::SeedStarterItems()
{
	UGameInstance* GI = GetGameInstance();
	UchuckItemDB* DB = GI ? GI->GetSubsystem<UchuckItemDB>() : nullptr;
	if (!DB)
	{
		return;
	}

	int32 SlotsLeft = Inventory.DefaultBag.Capacity;
	for (const FKBVEItemDef& Def : DB->GetAll())
	{
		if (SlotsLeft <= 0) break;
		if (!Def.IsValid()) continue;
		const int32 Want = Def.bStackable ? FMath::Min(Def.MaxStack > 1 ? Def.MaxStack : 5, 8) : 1;
		ServerAddItemByKey(Def.Key, Want);
		--SlotsLeft;
	}
}

void AchuckCoreCharacter::SwapBagSlots(int32 IndexA, int32 IndexB, bool bHotbar)
{
	FchuckInventoryBag& Bag = bHotbar ? Inventory.Hotbar : Inventory.DefaultBag;
	if (!Bag.Slots.IsValidIndex(IndexA) || !Bag.Slots.IsValidIndex(IndexB))
	{
		return;
	}
	FchuckInventoryStack Tmp = Bag.Slots[IndexA];
	Bag.Slots[IndexA] = Bag.Slots[IndexB];
	Bag.Slots[IndexB] = Tmp;
	Bag.MarkItemDirty(Bag.Slots[IndexA]);
	Bag.MarkItemDirty(Bag.Slots[IndexB]);
}

void AchuckCoreCharacter::SwapAcrossContainers(int32 BagIndex, int32 HotbarIndex)
{
	FchuckInventoryBag& BagA = Inventory.DefaultBag;
	FchuckInventoryBag& BagB = Inventory.Hotbar;
	if (!BagA.Slots.IsValidIndex(BagIndex) || !BagB.Slots.IsValidIndex(HotbarIndex))
	{
		return;
	}
	FchuckInventoryStack Tmp = BagA.Slots[BagIndex];
	BagA.Slots[BagIndex] = BagB.Slots[HotbarIndex];
	BagB.Slots[HotbarIndex] = Tmp;
	BagA.MarkItemDirty(BagA.Slots[BagIndex]);
	BagB.MarkItemDirty(BagB.Slots[HotbarIndex]);
}

bool AchuckCoreCharacter::ServerDropSlot(int32 SlotIndex, bool bHotbar, int32 DropCount)
{
	if (!HasAuthority()) return false;
	FchuckInventoryBag& Bag = bHotbar ? Inventory.Hotbar : Inventory.DefaultBag;
	if (!Bag.Slots.IsValidIndex(SlotIndex)) return false;
	FchuckInventoryStack& Stack = Bag.Slots[SlotIndex];
	if (Stack.IsEmpty()) return false;

	const int32 N = FMath::Clamp(DropCount, 1, Stack.Count);
	const int32 ItemKey = Stack.ItemKey;

	UGameInstance* GI = GetGameInstance();
	UchuckItemDB* DB = GI ? GI->GetSubsystem<UchuckItemDB>() : nullptr;
	if (!DB) return false;
	const FKBVEItemDef* Def = DB->LookupByKey(ItemKey);
	if (!Def) return false;

	UWorld* World = GetWorld();
	UKBVEDroppedItemPool* Pool = World ? World->GetSubsystem<UKBVEDroppedItemPool>() : nullptr;
	if (!Pool) return false;

	const FVector Fwd = GetActorForwardVector();
	const FVector Loc = GetActorLocation() + Fwd * 110.f + FVector(0, 0, -30.f);
	Pool->SpawnDrop(ItemKey, N, Loc);

	Stack.Count -= N;
	if (Stack.Count <= 0)
	{
		Stack = FchuckInventoryStack();
	}
	Bag.MarkItemDirty(Stack);
	return true;
}

bool AchuckCoreCharacter::ServerConsumeSlot(int32 SlotIndex, bool bHotbar)
{
	if (!HasAuthority()) return false;

	FchuckInventoryBag& Bag = bHotbar ? Inventory.Hotbar : Inventory.DefaultBag;
	if (!Bag.Slots.IsValidIndex(SlotIndex)) return false;
	FchuckInventoryStack& Stack = Bag.Slots[SlotIndex];
	if (Stack.IsEmpty()) return false;

	UGameInstance* GI = GetGameInstance();
	UchuckItemDB* DB = GI ? GI->GetSubsystem<UchuckItemDB>() : nullptr;
	if (!DB) return false;
	const FKBVEItemDef* Def = DB->LookupByKey(Stack.ItemKey);
	if (!Def || !Def->bConsumable || !EffectComp) return false;

	FKBVEEffectSpec Spec;
	Spec.SourceKey = Def->Ref;
	Spec.Cooldown  = Def->Cooldown;
	if (Def->Food.Heals         > 0.f) Spec.Restores.Add({ TEXT("Health"),  Def->Food.Heals });
	if (Def->Food.RestoreMana   > 0.f) Spec.Restores.Add({ TEXT("Mana"),    Def->Food.RestoreMana });
	if (Def->Food.RestoreEnergy > 0.f) Spec.Restores.Add({ TEXT("Stamina"), Def->Food.RestoreEnergy });
	if (Def->Food.RegenPerSecond > 0.f && Def->Food.RegenDuration > 0.f)
	{
		const FName RegenStat = Def->IsDrink()
			? (Def->Food.RestoreMana > 0.f ? FName(TEXT("Mana")) : FName(TEXT("Stamina")))
			: FName(TEXT("Health"));
		Spec.Regens.Add({ RegenStat, Def->Food.RegenPerSecond, Def->Food.RegenDuration });
	}
	for (const FKBVEConsumeStatus& St : Def->ConsumeStatuses)
	{
		Spec.Statuses.Add({ St.Kind, St.Stacks, St.Duration });
	}

	const float OldH = Stats.Health, OldM = Stats.Mana, OldE = Stats.Stamina;
	if (!EffectComp->TryApplyEffect(Spec))
	{
		return false;
	}

	const int32 ConsumedKey = Stack.ItemKey;
	Stack.Count -= 1;
	if (Stack.Count <= 0)
	{
		Stack = FchuckInventoryStack();
	}
	Bag.MarkItemDirty(Stack);

	if (UchuckUIEvents* Bus = UchuckUIEvents::Get(this))
	{
		FchuckItemConsumedPayload P;
		P.ItemKey   = ConsumedKey;
		P.HealHP    = Stats.Health  - OldH;
		P.RestoreMP = Stats.Mana    - OldM;
		P.RestoreEP = Stats.Stamina - OldE;
		Bus->ItemConsumed.Publish(P);
	}
	return true;
}

float AchuckCoreCharacter::GetStatValue(FName StatId) const
{
	if (StatId == KBVEStats::Health)  return Stats.Health;
	if (StatId == KBVEStats::Mana)    return Stats.Mana;
	if (StatId == KBVEStats::Energy)  return Stats.Energy;
	if (StatId == KBVEStats::Stamina) return Stats.Stamina;
	return 0.f;
}

float AchuckCoreCharacter::GetStatMax(FName StatId) const
{
	if (StatId == KBVEStats::Health)  return Stats.MaxHealth;
	if (StatId == KBVEStats::Mana)    return Stats.MaxMana;
	if (StatId == KBVEStats::Energy)  return Stats.MaxEnergy;
	if (StatId == KBVEStats::Stamina) return Stats.MaxStamina;
	return 0.f;
}

void AchuckCoreCharacter::ApplyStatDelta(FName StatId, float Delta)
{
	if (!HasAuthority() || Delta == 0.f) return;

	if (StatId == KBVEStats::Health)       Stats.Health  = FMath::Clamp(Stats.Health  + Delta, 0.f, Stats.MaxHealth);
	else if (StatId == KBVEStats::Mana)    Stats.Mana    = FMath::Clamp(Stats.Mana    + Delta, 0.f, Stats.MaxMana);
	else if (StatId == KBVEStats::Energy)  Stats.Energy  = FMath::Clamp(Stats.Energy  + Delta, 0.f, Stats.MaxEnergy);
	else if (StatId == KBVEStats::Stamina) Stats.Stamina = FMath::Clamp(Stats.Stamina + Delta, 0.f, Stats.MaxStamina);
	else return;

	UWorld* World = GetWorld();
	UMassEntitySubsystem* Mass = World ? World->GetSubsystem<UMassEntitySubsystem>() : nullptr;
	if (Mass && StatEntity.IsValid())
	{
		if (FKBVEStatFragment* Frag = Mass->GetMutableEntityManager().GetFragmentDataPtr<FKBVEStatFragment>(StatEntity))
		{
			Frag->Health  = Stats.Health;
			Frag->Mana    = Stats.Mana;
			Frag->Energy  = Stats.Energy;
			Frag->Stamina = Stats.Stamina;
		}
	}

	PublishStatChanges();
}

void AchuckCoreCharacter::OnRep_Stats()
{
	PublishStatChanges();
}

void AchuckCoreCharacter::PublishStatChanges()
{
	UchuckUIEvents* Bus = UchuckUIEvents::Get(this);
	if (!Bus) return;

	if (!FMath::IsNearlyEqual(Stats.Health, LastPublishedStats.Health) ||
		!FMath::IsNearlyEqual(Stats.MaxHealth, LastPublishedStats.MaxHealth))
	{
		Bus->Health.Publish({ Stats.Health, Stats.MaxHealth });
	}
	if (!FMath::IsNearlyEqual(Stats.Mana, LastPublishedStats.Mana) ||
		!FMath::IsNearlyEqual(Stats.MaxMana, LastPublishedStats.MaxMana))
	{
		Bus->Mana.Publish({ Stats.Mana, Stats.MaxMana });
	}
	if (!FMath::IsNearlyEqual(Stats.Energy, LastPublishedStats.Energy) ||
		!FMath::IsNearlyEqual(Stats.MaxEnergy, LastPublishedStats.MaxEnergy))
	{
		Bus->Energy.Publish({ Stats.Energy, Stats.MaxEnergy });
	}
	if (!FMath::IsNearlyEqual(Stats.Stamina, LastPublishedStats.Stamina) ||
		!FMath::IsNearlyEqual(Stats.MaxStamina, LastPublishedStats.MaxStamina) ||
		!FMath::IsNearlyEqual(Stats.StaminaRegenDelay, LastPublishedStats.StaminaRegenDelay))
	{
		Bus->Stamina.Publish({ Stats.Stamina, Stats.MaxStamina, Stats.StaminaRegenDelay });
	}
	if (Stats.Health < LastPublishedStats.Health - 0.5f)
	{
		Bus->DamageReceived.Publish({ LastPublishedStats.Health - Stats.Health, 0 });
	}
	LastPublishedStats = Stats;
}

void AchuckCoreCharacter::SubmitMoveInput(const FVector& WorldIntent)
{
	if (!WorldIntent.IsNearlyZero())
	{
		AddMovementInput(WorldIntent.GetSafeNormal(), (float)FMath::Min(1.0, WorldIntent.Size()));
	}
}

void AchuckCoreCharacter::SubmitJump(bool bPressed)
{
	if (bPressed)
	{
		Jump();
	}
	else
	{
		StopJumping();
	}
}

FVector AchuckCoreCharacter::GetAuthoritativeVelocity() const
{
	return GetVelocity();
}

void AchuckCoreCharacter::ApplyServerCorrection(const FVector& Position, const FVector& Velocity)
{
	SetActorLocation(Position, false, nullptr, ETeleportType::TeleportPhysics);
	if (UCharacterMovementComponent* CM = GetCharacterMovement())
	{
		CM->Velocity = Velocity;
	}
}
