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
#include "MassCommonTypes.h"
#include "MassEntityManager.h"
#include "MassEntitySubsystem.h"
#include "Net/UnrealNetwork.h"
#include "UObject/ConstructorHelpers.h"

#include "chuckCharacterMovementComponent.h"
#include "chuckInputs.h"
#include "chuckInventoryFragment.h"
#include "chuckItemDB.h"
#include "chuckMoveState.h"
#include "chuckStatsFragment.h"
#include "Engine/GameInstance.h"

AchuckCoreCharacter::AchuckCoreCharacter(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer.SetDefaultSubobjectClass<UchuckCharacterMovementComponent>(ACharacter::CharacterMovementComponentName))
{
	bReplicates = true;
	SetReplicateMovement(true);
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = true;

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
	}

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
	FragmentTypes.Add(FchuckStatsFragment::StaticStruct());

	FMassArchetypeHandle Archetype = EntityManager.CreateArchetype(FragmentTypes);
	StatEntity = EntityManager.CreateEntity(Archetype);

	if (FchuckStatsFragment* Frag = EntityManager.GetFragmentDataPtr<FchuckStatsFragment>(StatEntity))
	{
		Frag->Health                    = Stats.Health;
		Frag->MaxHealth                 = Stats.MaxHealth;
		Frag->HealthRegenPerSec         = Stats.HealthRegenPerSec;
		Frag->Mana                      = Stats.Mana;
		Frag->MaxMana                   = Stats.MaxMana;
		Frag->ManaRegenPerSec           = Stats.ManaRegenPerSec;
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
	FchuckStatsFragment* Frag = EM.GetFragmentDataPtr<FchuckStatsFragment>(StatEntity);
	if (!Frag)
	{
		return;
	}

	UCharacterMovementComponent* Move = GetCharacterMovement();
	const bool bOnGround = Move && Move->IsMovingOnGround();
	const bool bFalling  = Move && Move->IsFalling();
	const bool bMoving   = bOnGround && Move->Velocity.SizeSquared2D() > 1.f;

	EchuckMoveState State = EchuckMoveState::None;
	chuckMove::Assign(State, EchuckMoveState::OnGround,  bOnGround);
	chuckMove::Assign(State, EchuckMoveState::InAir,     !bOnGround);
	chuckMove::Assign(State, EchuckMoveState::Falling,   bFalling);
	chuckMove::Assign(State, EchuckMoveState::Moving,    bMoving);
	chuckMove::Assign(State, EchuckMoveState::Sprinting, IsSprinting());
	chuckMove::Assign(State, EchuckMoveState::Crouching, bIsCrouched);
	Frag->MoveState = State;

	Stats.Health           = Frag->Health;
	Stats.Mana             = Frag->Mana;
	Stats.Stamina          = Frag->Stamina;
	Stats.StaminaRegenDelay = Frag->StaminaRegenDelay;

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
	}
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
	const FchuckItemDef* Def = DB->LookupByKey(ItemKey);
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
	if (const FchuckItemDef* Def = DB->LookupByRef(Ref))
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
	for (const FchuckItemDef& Def : DB->GetAll())
	{
		if (SlotsLeft <= 0) break;
		if (!Def.IsValid()) continue;
		const int32 Want = Def.bStackable ? FMath::Min(Def.MaxStack > 1 ? Def.MaxStack : 5, 8) : 1;
		ServerAddItemByKey(Def.Key, Want);
		--SlotsLeft;
	}
}
