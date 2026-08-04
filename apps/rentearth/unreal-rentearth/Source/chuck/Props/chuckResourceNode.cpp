#include "Props/chuckResourceNode.h"

#include "Components/SphereComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/GameInstance.h"
#include "GameFramework/Pawn.h"

#include "Core/chuckCoreCharacter.h"
#include "KBVEMapDatabase.h"
#include "KBVEMapTypes.h"
#include "KBVEProfessionDBDatabase.h"
#include "KBVEProfessionTypes.h"

namespace
{
	TWeakObjectPtr<AchuckResourceNode> GCurrentNearbyResourceNode;
}

AchuckResourceNode::AchuckResourceNode()
{
	PrimaryActorTick.bCanEverTick = false;
	SetReplicates(false);

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	RootComponent = Mesh;

	InteractionRadius = CreateDefaultSubobject<USphereComponent>(TEXT("InteractionRadius"));
	InteractionRadius->SetupAttachment(RootComponent);
	InteractionRadius->SetSphereRadius(InteractionRadiusCm);
	InteractionRadius->SetCollisionProfileName(TEXT("OverlapAllDynamic"));
	InteractionRadius->SetGenerateOverlapEvents(true);
}

void AchuckResourceNode::BeginPlay()
{
	Super::BeginPlay();

	if (InteractionRadius)
	{
		InteractionRadius->OnComponentBeginOverlap.AddDynamic(this, &AchuckResourceNode::HandleBeginOverlap);
		InteractionRadius->OnComponentEndOverlap.AddDynamic(this, &AchuckResourceNode::HandleEndOverlap);
		InteractionRadius->SetSphereRadius(InteractionRadiusCm);
	}

	UGameInstance* GI = GetGameInstance();
	UKBVEMapDatabase* MapDB = GI ? GI->GetSubsystem<UKBVEMapDatabase>() : nullptr;
	if (MapDB)
	{
		if (const FKBVEWorldObjectDef* Def = MapDB->FindObjectByRef(NodeRef))
		{
			ProfessionActionRef = Def->ProfessionActionRef;
			RemainingAmount = Def->InitialAmount > 0 ? Def->InitialAmount : Def->MaxAmount;
		}
	}
}

void AchuckResourceNode::EndPlay(const EEndPlayReason::Type Reason)
{
	if (GCurrentNearbyResourceNode.Get() == this)
	{
		GCurrentNearbyResourceNode.Reset();
	}
	Super::EndPlay(Reason);
}

void AchuckResourceNode::HandleBeginOverlap(UPrimitiveComponent*, AActor* OtherActor, UPrimitiveComponent*, int32, bool, const FHitResult&)
{
	APawn* Pawn = Cast<APawn>(OtherActor);
	if (!Pawn || !Pawn->IsPlayerControlled())
	{
		return;
	}
	GCurrentNearbyResourceNode = this;
}

void AchuckResourceNode::HandleEndOverlap(UPrimitiveComponent*, AActor* OtherActor, UPrimitiveComponent*, int32)
{
	APawn* Pawn = Cast<APawn>(OtherActor);
	if (!Pawn || !Pawn->IsPlayerControlled())
	{
		return;
	}
	if (GCurrentNearbyResourceNode.Get() == this)
	{
		GCurrentNearbyResourceNode.Reset();
	}
}

void AchuckResourceNode::Gather(AchuckCoreCharacter* Gatherer)
{
	if (!Gatherer || !Gatherer->HasAuthority())
	{
		return;
	}
	if (RemainingAmount <= 0 || ProfessionActionRef.IsNone())
	{
		return;
	}

	UGameInstance* GI = GetGameInstance();
	UKBVEProfessionDBDatabase* ProfDB = GI ? GI->GetSubsystem<UKBVEProfessionDBDatabase>() : nullptr;
	if (!ProfDB)
	{
		return;
	}

	const FKBVEProfessionActionDef* Action = ProfDB->LookupActionByRef(ProfessionActionRef);
	if (!Action)
	{
		return;
	}

	for (const FKBVEProfessionResource& Output : Action->Outputs)
	{
		if (Output.ItemRef.IsNone() || Output.Quantity <= 0)
		{
			continue;
		}
		Gatherer->ServerAddItemByRef(Output.ItemRef, Output.Quantity);
	}

	RemainingAmount -= 1;
}

AchuckResourceNode* AchuckResourceNode::GetNearby()
{
	return GCurrentNearbyResourceNode.Get();
}

bool AchuckResourceNode::GatherNearby(AchuckCoreCharacter* Gatherer)
{
	AchuckResourceNode* Near = GCurrentNearbyResourceNode.Get();
	if (!Near || Near->IsDepleted())
	{
		return false;
	}
	Near->Gather(Gatherer);
	return true;
}
