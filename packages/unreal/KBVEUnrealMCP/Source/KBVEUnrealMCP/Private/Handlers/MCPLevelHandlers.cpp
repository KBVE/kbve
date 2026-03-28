#include "Handlers/MCPLevelHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "FileHelpers.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Actor.h"
#include "Misc/Paths.h"

void FMCPLevelHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("level.get_info"), &HandleGetInfo);
	Registry.RegisterHandler(TEXT("level.list_levels"), &HandleListLevels);
	Registry.RegisterHandler(TEXT("level.open"), &HandleOpen);
	Registry.RegisterHandler(TEXT("level.save"), &HandleSave);
	Registry.RegisterHandler(TEXT("level.get_world_outliner"), &HandleGetWorldOutliner);

	// TODO: ChiR24 — World Partition and level structure management
	Registry.RegisterHandler(TEXT("level.world_partition"), MCPProtocolHelpers::MakeStub(TEXT("level.world_partition")));
	Registry.RegisterHandler(TEXT("level.data_layers"), MCPProtocolHelpers::MakeStub(TEXT("level.data_layers")));
	Registry.RegisterHandler(TEXT("level.hlod"), MCPProtocolHelpers::MakeStub(TEXT("level.hlod")));
	Registry.RegisterHandler(TEXT("level.create"), MCPProtocolHelpers::MakeStub(TEXT("level.create")));
}

void FMCPLevelHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();

	Result->SetStringField(TEXT("project_name"), FApp::GetProjectName());
	Result->SetStringField(TEXT("engine_version"), FEngineVersion::Current().ToString());
	Result->SetStringField(TEXT("project_dir"), FPaths::ProjectDir());

	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (World)
	{
		Result->SetStringField(TEXT("current_level"), World->GetMapName());
		Result->SetStringField(TEXT("world_path"), World->GetPathName());
	}

	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPLevelHandlers::HandleListLevels(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	TArray<TSharedPtr<FJsonValue>> Levels;
	for (ULevel* Level : World->GetLevels())
	{
		if (!Level) continue;
		TSharedPtr<FJsonObject> LevelObj = MakeShared<FJsonObject>();
		LevelObj->SetStringField(TEXT("name"), Level->GetOuter()->GetName());
		LevelObj->SetBoolField(TEXT("is_current"), Level == World->GetCurrentLevel());
		LevelObj->SetBoolField(TEXT("is_persistent"), Level->IsPersistentLevel());
		LevelObj->SetNumberField(TEXT("actor_count"), Level->Actors.Num());
		Levels.Add(MakeShared<FJsonValueObject>(LevelObj));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("levels"), Levels);
	Result->SetNumberField(TEXT("count"), Levels.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPLevelHandlers::HandleOpen(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString MapPath = Params->GetStringField(TEXT("map_path"));
	if (MapPath.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'map_path' is required"));
		return;
	}

	bool bPromptSave = Params->GetBoolField(TEXT("prompt_save"));

	if (bPromptSave)
	{
		FEditorFileUtils::SaveDirtyPackages(true, true, true);
	}

	FEditorFileUtils::LoadMap(MapPath);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("opened"), MapPath);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPLevelHandlers::HandleSave(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	FEditorFileUtils::SaveCurrentLevel();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("saved"), World->GetMapName());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPLevelHandlers::HandleGetWorldOutliner(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	TArray<TSharedPtr<FJsonValue>> Actors;
	for (TActorIterator<AActor> It(World); It; ++It)
	{
		AActor* Actor = *It;
		TSharedPtr<FJsonObject> ActorObj = MakeShared<FJsonObject>();
		ActorObj->SetStringField(TEXT("name"), Actor->GetName());
		ActorObj->SetStringField(TEXT("label"), Actor->GetActorLabel());
		ActorObj->SetStringField(TEXT("class"), Actor->GetClass()->GetName());
		ActorObj->SetBoolField(TEXT("hidden"), Actor->IsHidden());

		AActor* Parent = Actor->GetAttachParentActor();
		if (Parent)
		{
			ActorObj->SetStringField(TEXT("parent"), Parent->GetActorLabel());
		}

		FString FolderPath = Actor->GetFolderPath().ToString();
		if (!FolderPath.IsEmpty())
		{
			ActorObj->SetStringField(TEXT("folder"), FolderPath);
		}

		Actors.Add(MakeShared<FJsonValueObject>(ActorObj));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("actors"), Actors);
	Result->SetNumberField(TEXT("count"), Actors.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
