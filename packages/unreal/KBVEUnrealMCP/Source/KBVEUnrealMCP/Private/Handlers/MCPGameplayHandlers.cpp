#include "Handlers/MCPGameplayHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "GameplayTagContainer.h"
#include "GameplayTagsManager.h"
#include "Editor.h"
#include "Engine/World.h"
#include "Engine/TriggerBox.h"
#include "Engine/TriggerSphere.h"
#include "EngineUtils.h"

void FMCPGameplayHandlers::Register(FMCPHandlerRegistry& Registry)
{
	// GAS ability/attribute require the GameplayAbilities plugin (optional)
	Registry.RegisterHandler(TEXT("gameplay.add_ability"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.add_ability")));
	Registry.RegisterHandler(TEXT("gameplay.add_attribute"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.add_attribute")));
	Registry.RegisterHandler(TEXT("gameplay.create_interaction"), &HandleCreateInteraction);
	Registry.RegisterHandler(TEXT("gameplay.get_info"), &HandleGetInfo);

	// TODO: ChiR24+GenAISupport — gameplay systems
	Registry.RegisterHandler(TEXT("gameplay.create_game_mode"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.create_game_mode")));
	Registry.RegisterHandler(TEXT("gameplay.create_character"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.create_character")));
	Registry.RegisterHandler(TEXT("gameplay.create_combat"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.create_combat")));
	Registry.RegisterHandler(TEXT("gameplay.create_inventory"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.create_inventory")));
	Registry.RegisterHandler(TEXT("gameplay.create_interactable"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.create_interactable")));

	// TODO: ChiR24 — Gameplay Ability System (GAS)
	Registry.RegisterHandler(TEXT("gameplay.add_gas_component"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.add_gas_component")));
	Registry.RegisterHandler(TEXT("gameplay.create_attribute_set"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.create_attribute_set")));
	Registry.RegisterHandler(TEXT("gameplay.create_gameplay_effect"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.create_gameplay_effect")));
	Registry.RegisterHandler(TEXT("gameplay.create_gameplay_cue"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.create_gameplay_cue")));
}

void FMCPGameplayHandlers::HandleCreateInteraction(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString Shape = Params->GetStringField(TEXT("shape")).ToLower();
	FVector Location = FVector::ZeroVector;
	const TArray<TSharedPtr<FJsonValue>>* LocArr;
	if (Params->TryGetArrayField(TEXT("location"), LocArr) && LocArr->Num() >= 3)
		Location = FVector((*LocArr)[0]->AsNumber(), (*LocArr)[1]->AsNumber(), (*LocArr)[2]->AsNumber());

	AActor* Trigger = nullptr;
	if (Shape == TEXT("sphere"))
		Trigger = World->SpawnActor<ATriggerSphere>(Location, FRotator::ZeroRotator);
	else
		Trigger = World->SpawnActor<ATriggerBox>(Location, FRotator::ZeroRotator);

	if (!Trigger) { MCPProtocolHelpers::Fail(OnComplete, TEXT("SPAWN_FAILED"), TEXT("Failed to spawn trigger volume")); return; }

	FString Label = Params->GetStringField(TEXT("label"));
	if (!Label.IsEmpty()) Trigger->SetActorLabel(Label);

	const TArray<TSharedPtr<FJsonValue>>* ScaleArr;
	if (Params->TryGetArrayField(TEXT("scale"), ScaleArr) && ScaleArr->Num() >= 3)
		Trigger->SetActorScale3D(FVector((*ScaleArr)[0]->AsNumber(), (*ScaleArr)[1]->AsNumber(), (*ScaleArr)[2]->AsNumber()));

	// Add gameplay tags if provided
	const TArray<TSharedPtr<FJsonValue>>* TagsArr;
	if (Params->TryGetArrayField(TEXT("tags"), TagsArr))
	{
		for (const TSharedPtr<FJsonValue>& TagVal : *TagsArr)
		{
			FString TagStr = TagVal->AsString();
			if (!TagStr.IsEmpty())
			{
				Trigger->Tags.Add(FName(*TagStr));
			}
		}
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor_name"), Trigger->GetName());
	Result->SetStringField(TEXT("actor_label"), Trigger->GetActorLabel());
	Result->SetStringField(TEXT("shape"), Shape.IsEmpty() ? TEXT("box") : Shape);
	Result->SetStringField(TEXT("class"), Trigger->GetClass()->GetName());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPGameplayHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();

	UGameplayTagsManager& TagManager = UGameplayTagsManager::Get();
	FGameplayTagContainer AllTags;
	TagManager.RequestAllGameplayTags(AllTags, true);

	TArray<TSharedPtr<FJsonValue>> TagArr;
	for (const FGameplayTag& Tag : AllTags)
	{
		TagArr.Add(MakeShared<FJsonValueString>(Tag.ToString()));
	}
	Result->SetArrayField(TEXT("gameplay_tags"), TagArr);
	Result->SetNumberField(TEXT("tag_count"), TagArr.Num());

	bool bGASAvailable = FModuleManager::Get().IsModuleLoaded(TEXT("GameplayAbilities"));
	Result->SetBoolField(TEXT("gameplay_abilities_available"), bGASAvailable);

	// List trigger volumes in the world
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (World)
	{
		TArray<TSharedPtr<FJsonValue>> Triggers;
		for (TActorIterator<ATriggerBase> It(World); It; ++It)
		{
			TSharedPtr<FJsonObject> T = MakeShared<FJsonObject>();
			T->SetStringField(TEXT("name"), It->GetName());
			T->SetStringField(TEXT("label"), It->GetActorLabel());
			T->SetStringField(TEXT("class"), It->GetClass()->GetName());
			Triggers.Add(MakeShared<FJsonValueObject>(T));
		}
		Result->SetArrayField(TEXT("trigger_volumes"), Triggers);
	}

	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
