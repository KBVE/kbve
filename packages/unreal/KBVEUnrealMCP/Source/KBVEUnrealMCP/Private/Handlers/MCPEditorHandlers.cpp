#include "Handlers/MCPEditorHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Engine/Selection.h"
#include "AssetToolsModule.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "ObjectTools.h"
#include "CollisionQueryParams.h"

void FMCPEditorHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("editor.undo"), &HandleUndo);
	Registry.RegisterHandler(TEXT("editor.redo"), &HandleRedo);
	Registry.RegisterHandler(TEXT("editor.select"), &HandleSelect);
	Registry.RegisterHandler(TEXT("editor.get_selection"), &HandleGetSelection);
	Registry.RegisterHandler(TEXT("editor.rename_asset"), &HandleRenameAsset);
	Registry.RegisterHandler(TEXT("editor.delete_asset"), &HandleDeleteAsset);
	Registry.RegisterHandler(TEXT("editor.find_in_radius"), &HandleFindInRadius);
	Registry.RegisterHandler(TEXT("editor.raycast"), &HandleRaycast);
	Registry.RegisterHandler(TEXT("editor.set_label"), &HandleSetLabel);
	Registry.RegisterHandler(TEXT("editor.set_folder"), &HandleSetFolder);
	Registry.RegisterHandler(TEXT("editor.add_tag"), &HandleAddTag);
	Registry.RegisterHandler(TEXT("editor.remove_tag"), &HandleRemoveTag);
	Registry.RegisterHandler(TEXT("editor.find_by_tag"), &HandleFindByTag);

	// TODO: runreal — project information endpoint
	Registry.RegisterHandler(TEXT("editor.get_project_info"), MCPProtocolHelpers::MakeStub(TEXT("editor.get_project_info")));
	// TODO: ChiR24 — CVar management
	Registry.RegisterHandler(TEXT("editor.set_cvar"), MCPProtocolHelpers::MakeStub(TEXT("editor.set_cvar")));
	Registry.RegisterHandler(TEXT("editor.get_cvar"), MCPProtocolHelpers::MakeStub(TEXT("editor.get_cvar")));

	// TODO: ChiR24+SpecialAgent — editor operations
	Registry.RegisterHandler(TEXT("editor.save_all"), MCPProtocolHelpers::MakeStub(TEXT("editor.save_all")));
	Registry.RegisterHandler(TEXT("editor.open_asset"), MCPProtocolHelpers::MakeStub(TEXT("editor.open_asset")));
	Registry.RegisterHandler(TEXT("editor.select_at_screen"), MCPProtocolHelpers::MakeStub(TEXT("editor.select_at_screen")));
	Registry.RegisterHandler(TEXT("editor.get_selection_bounds"), MCPProtocolHelpers::MakeStub(TEXT("editor.get_selection_bounds")));
}

void FMCPEditorHandlers::HandleUndo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	int32 Steps = (int32)Params->GetNumberField(TEXT("steps"));
	if (Steps <= 0) Steps = 1;

	for (int32 i = 0; i < Steps; i++)
	{
		GEditor->UndoTransaction();
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetNumberField(TEXT("steps_undone"), Steps);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPEditorHandlers::HandleRedo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	int32 Steps = (int32)Params->GetNumberField(TEXT("steps"));
	if (Steps <= 0) Steps = 1;

	for (int32 i = 0; i < Steps; i++)
	{
		GEditor->RedoTransaction();
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetNumberField(TEXT("steps_redone"), Steps);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPEditorHandlers::HandleSelect(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	bool bAdditive = Params->GetBoolField(TEXT("additive"));

	if (!bAdditive)
	{
		GEditor->SelectNone(true, true);
	}

	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }

	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	GEditor->SelectActor(Actor, true, true);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("selected"), Actor->GetActorLabel());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPEditorHandlers::HandleGetSelection(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	TArray<TSharedPtr<FJsonValue>> Selected;
	for (FSelectionIterator It(GEditor->GetSelectedActorIterator()); It; ++It)
	{
		AActor* Actor = Cast<AActor>(*It);
		if (!Actor) continue;
		TSharedPtr<FJsonObject> A = MakeShared<FJsonObject>();
		A->SetStringField(TEXT("name"), Actor->GetName());
		A->SetStringField(TEXT("label"), Actor->GetActorLabel());
		A->SetStringField(TEXT("class"), Actor->GetClass()->GetName());
		Selected.Add(MakeShared<FJsonValueObject>(A));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("selected"), Selected);
	Result->SetNumberField(TEXT("count"), Selected.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPEditorHandlers::HandleRenameAsset(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString AssetPath = Params->GetStringField(TEXT("asset_path"));
	FString NewName = Params->GetStringField(TEXT("new_name"));

	if (AssetPath.IsEmpty() || NewName.IsEmpty())
	{ MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'asset_path' and 'new_name' are required")); return; }

	IAssetTools& AssetTools = FModuleManager::LoadModuleChecked<FAssetToolsModule>("AssetTools").Get();

	TArray<FAssetRenameData> RenameData;
	FString PackagePath = FPackageName::GetLongPackagePath(AssetPath);
	FString OldName = FPackageName::GetShortName(AssetPath);

	FAssetRenameData Rename;
	Rename.OldObjectPath = FSoftObjectPath(AssetPath);
	Rename.NewName = NewName;
	Rename.NewPackagePath = PackagePath;
	RenameData.Add(Rename);

	bool bSuccess = AssetTools.RenameAssets(RenameData);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("old_path"), AssetPath);
	Result->SetStringField(TEXT("new_name"), NewName);
	Result->SetBoolField(TEXT("renamed"), bSuccess);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPEditorHandlers::HandleDeleteAsset(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString AssetPath = Params->GetStringField(TEXT("asset_path"));
	if (AssetPath.IsEmpty()) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'asset_path' is required")); return; }

	UObject* Asset = LoadObject<UObject>(nullptr, *AssetPath);
	if (!Asset) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Asset not found: %s"), *AssetPath)); return; }

	TArray<UObject*> AssetsToDelete;
	AssetsToDelete.Add(Asset);
	int32 Deleted = ObjectTools::DeleteObjects(AssetsToDelete, false);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("asset_path"), AssetPath);
	Result->SetBoolField(TEXT("deleted"), Deleted > 0);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPEditorHandlers::HandleFindInRadius(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world")); return; }

	const TArray<TSharedPtr<FJsonValue>>* CenterArr;
	if (!Params->TryGetArrayField(TEXT("center"), CenterArr) || CenterArr->Num() < 3)
	{ MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'center' [x,y,z] required")); return; }

	FVector Center((*CenterArr)[0]->AsNumber(), (*CenterArr)[1]->AsNumber(), (*CenterArr)[2]->AsNumber());
	double Radius = Params->GetNumberField(TEXT("radius"));
	if (Radius <= 0) Radius = 1000.0;

	FString ClassFilter = Params->GetStringField(TEXT("class_filter"));
	double RadiusSq = Radius * Radius;

	TArray<TSharedPtr<FJsonValue>> Found;
	for (TActorIterator<AActor> It(World); It; ++It)
	{
		if (!ClassFilter.IsEmpty() && !It->GetClass()->GetName().Contains(ClassFilter)) continue;

		double DistSq = FVector::DistSquared(It->GetActorLocation(), Center);
		if (DistSq <= RadiusSq)
		{
			TSharedPtr<FJsonObject> A = MakeShared<FJsonObject>();
			A->SetStringField(TEXT("label"), It->GetActorLabel());
			A->SetStringField(TEXT("class"), It->GetClass()->GetName());
			A->SetNumberField(TEXT("distance"), FMath::Sqrt(DistSq));
			Found.Add(MakeShared<FJsonValueObject>(A));
		}
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("actors"), Found);
	Result->SetNumberField(TEXT("count"), Found.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPEditorHandlers::HandleRaycast(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world")); return; }

	const TArray<TSharedPtr<FJsonValue>>* StartArr;
	const TArray<TSharedPtr<FJsonValue>>* EndArr;
	if (!Params->TryGetArrayField(TEXT("start"), StartArr) || StartArr->Num() < 3 ||
		!Params->TryGetArrayField(TEXT("end"), EndArr) || EndArr->Num() < 3)
	{ MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'start' and 'end' [x,y,z] required")); return; }

	FVector Start((*StartArr)[0]->AsNumber(), (*StartArr)[1]->AsNumber(), (*StartArr)[2]->AsNumber());
	FVector End((*EndArr)[0]->AsNumber(), (*EndArr)[1]->AsNumber(), (*EndArr)[2]->AsNumber());

	FHitResult Hit;
	FCollisionQueryParams QueryParams;
	QueryParams.bTraceComplex = true;

	bool bHit = World->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, QueryParams);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetBoolField(TEXT("hit"), bHit);
	if (bHit)
	{
		Result->SetArrayField(TEXT("location"), { MakeShared<FJsonValueNumber>(Hit.Location.X), MakeShared<FJsonValueNumber>(Hit.Location.Y), MakeShared<FJsonValueNumber>(Hit.Location.Z) });
		Result->SetArrayField(TEXT("normal"), { MakeShared<FJsonValueNumber>(Hit.Normal.X), MakeShared<FJsonValueNumber>(Hit.Normal.Y), MakeShared<FJsonValueNumber>(Hit.Normal.Z) });
		Result->SetNumberField(TEXT("distance"), Hit.Distance);
		if (Hit.GetActor())
		{
			Result->SetStringField(TEXT("actor"), Hit.GetActor()->GetActorLabel());
			Result->SetStringField(TEXT("component"), Hit.GetComponent() ? Hit.GetComponent()->GetName() : TEXT("none"));
		}
	}
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPEditorHandlers::HandleSetLabel(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	FString NewLabel = Params->GetStringField(TEXT("new_label"));

	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }
	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	Actor->SetActorLabel(NewLabel);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("old_label"), Name);
	Result->SetStringField(TEXT("new_label"), NewLabel);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPEditorHandlers::HandleSetFolder(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	FString FolderPath = Params->GetStringField(TEXT("folder"));

	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }
	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	Actor->SetFolderPath(FName(*FolderPath));

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetStringField(TEXT("folder"), FolderPath);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPEditorHandlers::HandleAddTag(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	FString Tag = Params->GetStringField(TEXT("tag"));

	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }
	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	Actor->Tags.AddUnique(FName(*Tag));

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetStringField(TEXT("tag"), Tag);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPEditorHandlers::HandleRemoveTag(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	FString Tag = Params->GetStringField(TEXT("tag"));

	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }
	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	Actor->Tags.Remove(FName(*Tag));

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetStringField(TEXT("removed_tag"), Tag);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPEditorHandlers::HandleFindByTag(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world")); return; }

	FString Tag = Params->GetStringField(TEXT("tag"));
	FName TagName(*Tag);

	TArray<TSharedPtr<FJsonValue>> Found;
	for (TActorIterator<AActor> It(World); It; ++It)
	{
		if (It->Tags.Contains(TagName))
		{
			TSharedPtr<FJsonObject> A = MakeShared<FJsonObject>();
			A->SetStringField(TEXT("label"), It->GetActorLabel());
			A->SetStringField(TEXT("class"), It->GetClass()->GetName());
			Found.Add(MakeShared<FJsonValueObject>(A));
		}
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("actors"), Found);
	Result->SetNumberField(TEXT("count"), Found.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
