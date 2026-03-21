#include "Handlers/MCPGameplayHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "GameplayTagContainer.h"
#include "GameplayTagsManager.h"

void FMCPGameplayHandlers::Register(FMCPHandlerRegistry& Registry)
{
	// GAS ability/attribute creation requires the GameplayAbilities plugin;
	// we keep these stubbed as GAS is an optional module.
	Registry.RegisterHandler(TEXT("gameplay.add_ability"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.add_ability")));
	Registry.RegisterHandler(TEXT("gameplay.add_attribute"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.add_attribute")));
	Registry.RegisterHandler(TEXT("gameplay.create_interaction"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.create_interaction")));
	Registry.RegisterHandler(TEXT("gameplay.get_info"), &HandleGetInfo);
}

void FMCPGameplayHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();

	// Report gameplay tags
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

	// Check if GAS plugin is loaded
	bool bGASAvailable = FModuleManager::Get().IsModuleLoaded(TEXT("GameplayAbilities"));
	Result->SetBoolField(TEXT("gameplay_abilities_available"), bGASAvailable);

	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
