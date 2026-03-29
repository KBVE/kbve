#include "Handlers/MCPActorHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "EngineUtils.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMeshActor.h"
#include "UObject/UObjectIterator.h"

void FMCPActorHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("actor.spawn"), &HandleSpawn);
	Registry.RegisterHandler(TEXT("actor.delete"), &HandleDelete);
	Registry.RegisterHandler(TEXT("actor.find"), &HandleFind);
	Registry.RegisterHandler(TEXT("actor.list"), &HandleList);
	Registry.RegisterHandler(TEXT("actor.get_transform"), &HandleGetTransform);
	Registry.RegisterHandler(TEXT("actor.set_transform"), &HandleSetTransform);
	Registry.RegisterHandler(TEXT("actor.get_properties"), &HandleGetProperties);
	Registry.RegisterHandler(TEXT("actor.set_property"), &HandleSetProperty);
	Registry.RegisterHandler(TEXT("actor.duplicate"), &HandleDuplicate);
	Registry.RegisterHandler(TEXT("actor.batch_transform"), &HandleBatchTransform);
	Registry.RegisterHandler(TEXT("actor.attach"), &HandleAttach);
	Registry.RegisterHandler(TEXT("actor.detach"), &HandleDetach);
	Registry.RegisterHandler(TEXT("actor.add_component"), &HandleAddComponent);

	// TODO: ChiR24+SpecialAgent — advanced actor operations
	Registry.RegisterHandler(TEXT("actor.set_visibility"), MCPProtocolHelpers::MakeStub(TEXT("actor.set_visibility")));
	Registry.RegisterHandler(TEXT("actor.get_bounds"), MCPProtocolHelpers::MakeStub(TEXT("actor.get_bounds")));
	Registry.RegisterHandler(TEXT("actor.apply_force"), MCPProtocolHelpers::MakeStub(TEXT("actor.apply_force")));
	Registry.RegisterHandler(TEXT("actor.set_collision"), MCPProtocolHelpers::MakeStub(TEXT("actor.set_collision")));
	Registry.RegisterHandler(TEXT("actor.call_function"), MCPProtocolHelpers::MakeStub(TEXT("actor.call_function")));
	Registry.RegisterHandler(TEXT("actor.find_by_class"), MCPProtocolHelpers::MakeStub(TEXT("actor.find_by_class")));
	Registry.RegisterHandler(TEXT("actor.create_snapshot"), MCPProtocolHelpers::MakeStub(TEXT("actor.create_snapshot")));
}

AActor* FMCPActorHandlers::FindActorByName(UWorld* World, const FString& Name)
{
	if (!World) return nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
	{
		if (It->GetActorLabel() == Name || It->GetName() == Name || It->GetPathName() == Name)
		{
			return *It;
		}
	}
	return nullptr;
}

void FMCPActorHandlers::HandleSpawn(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	FString ClassPath = Params->GetStringField(TEXT("class_path"));
	if (ClassPath.IsEmpty())
	{
		ClassPath = TEXT("/Script/Engine.StaticMeshActor");
	}

	UClass* ActorClass = FindObject<UClass>(nullptr, *ClassPath);
	if (!ActorClass)
	{
		ActorClass = LoadObject<UClass>(nullptr, *ClassPath);
	}
	if (!ActorClass)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_CLASS"), FString::Printf(TEXT("Cannot find class: %s"), *ClassPath));
		return;
	}

	FVector Location = FVector::ZeroVector;
	FRotator Rotation = FRotator::ZeroRotator;

	const TArray<TSharedPtr<FJsonValue>>* LocArray;
	if (Params->TryGetArrayField(TEXT("location"), LocArray) && LocArray->Num() >= 3)
	{
		Location.X = (*LocArray)[0]->AsNumber();
		Location.Y = (*LocArray)[1]->AsNumber();
		Location.Z = (*LocArray)[2]->AsNumber();
	}

	const TArray<TSharedPtr<FJsonValue>>* RotArray;
	if (Params->TryGetArrayField(TEXT("rotation"), RotArray) && RotArray->Num() >= 3)
	{
		Rotation.Pitch = (*RotArray)[0]->AsNumber();
		Rotation.Yaw = (*RotArray)[1]->AsNumber();
		Rotation.Roll = (*RotArray)[2]->AsNumber();
	}

	FActorSpawnParameters SpawnParams;
	FString Label;
	if (Params->TryGetStringField(TEXT("label"), Label) && !Label.IsEmpty())
	{
		SpawnParams.Name = *Label;
	}

	AActor* NewActor = World->SpawnActor<AActor>(ActorClass, Location, Rotation, SpawnParams);
	if (!NewActor)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("SPAWN_FAILED"), TEXT("Failed to spawn actor"));
		return;
	}

	if (!Label.IsEmpty())
	{
		NewActor->SetActorLabel(Label);
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor_name"), NewActor->GetName());
	Result->SetStringField(TEXT("actor_label"), NewActor->GetActorLabel());
	Result->SetStringField(TEXT("actor_path"), NewActor->GetPathName());
	Result->SetStringField(TEXT("actor_class"), NewActor->GetClass()->GetPathName());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPActorHandlers::HandleDelete(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = FindActorByName(World, Name);
	if (!Actor)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name));
		return;
	}

	FString DeletedName = Actor->GetActorLabel();
	World->EditorDestroyActor(Actor, true);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("deleted"), DeletedName);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPActorHandlers::HandleFind(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	FString Pattern = Params->GetStringField(TEXT("pattern"));
	FString ClassFilter = Params->GetStringField(TEXT("class_filter"));

	TArray<TSharedPtr<FJsonValue>> FoundActors;
	for (TActorIterator<AActor> It(World); It; ++It)
	{
		AActor* Actor = *It;
		if (!Pattern.IsEmpty())
		{
			if (!Actor->GetActorLabel().Contains(Pattern) && !Actor->GetName().Contains(Pattern))
			{
				continue;
			}
		}
		if (!ClassFilter.IsEmpty())
		{
			if (!Actor->GetClass()->GetName().Contains(ClassFilter))
			{
				continue;
			}
		}

		TSharedPtr<FJsonObject> ActorObj = MakeShared<FJsonObject>();
		ActorObj->SetStringField(TEXT("name"), Actor->GetName());
		ActorObj->SetStringField(TEXT("label"), Actor->GetActorLabel());
		ActorObj->SetStringField(TEXT("class"), Actor->GetClass()->GetName());
		ActorObj->SetStringField(TEXT("path"), Actor->GetPathName());
		FoundActors.Add(MakeShared<FJsonValueObject>(ActorObj));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("actors"), FoundActors);
	Result->SetNumberField(TEXT("count"), FoundActors.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPActorHandlers::HandleList(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	TSharedPtr<FJsonObject> ListParams = MakeShared<FJsonObject>();
	HandleFind(ListParams, OnComplete);
}

void FMCPActorHandlers::HandleGetTransform(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = FindActorByName(World, Name);
	if (!Actor)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name));
		return;
	}

	FVector Loc = Actor->GetActorLocation();
	FRotator Rot = Actor->GetActorRotation();
	FVector Scale = Actor->GetActorScale3D();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	TArray<TSharedPtr<FJsonValue>> LocArr = { MakeShared<FJsonValueNumber>(Loc.X), MakeShared<FJsonValueNumber>(Loc.Y), MakeShared<FJsonValueNumber>(Loc.Z) };
	TArray<TSharedPtr<FJsonValue>> RotArr = { MakeShared<FJsonValueNumber>(Rot.Pitch), MakeShared<FJsonValueNumber>(Rot.Yaw), MakeShared<FJsonValueNumber>(Rot.Roll) };
	TArray<TSharedPtr<FJsonValue>> ScaleArr = { MakeShared<FJsonValueNumber>(Scale.X), MakeShared<FJsonValueNumber>(Scale.Y), MakeShared<FJsonValueNumber>(Scale.Z) };
	Result->SetArrayField(TEXT("location"), LocArr);
	Result->SetArrayField(TEXT("rotation"), RotArr);
	Result->SetArrayField(TEXT("scale"), ScaleArr);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPActorHandlers::HandleSetTransform(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = FindActorByName(World, Name);
	if (!Actor)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name));
		return;
	}

	const TArray<TSharedPtr<FJsonValue>>* LocArray;
	if (Params->TryGetArrayField(TEXT("location"), LocArray) && LocArray->Num() >= 3)
	{
		FVector Loc((*LocArray)[0]->AsNumber(), (*LocArray)[1]->AsNumber(), (*LocArray)[2]->AsNumber());
		Actor->SetActorLocation(Loc);
	}

	const TArray<TSharedPtr<FJsonValue>>* RotArray;
	if (Params->TryGetArrayField(TEXT("rotation"), RotArray) && RotArray->Num() >= 3)
	{
		FRotator Rot((*RotArray)[0]->AsNumber(), (*RotArray)[1]->AsNumber(), (*RotArray)[2]->AsNumber());
		Actor->SetActorRotation(Rot);
	}

	const TArray<TSharedPtr<FJsonValue>>* ScaleArray;
	if (Params->TryGetArrayField(TEXT("scale"), ScaleArray) && ScaleArray->Num() >= 3)
	{
		FVector Scale((*ScaleArray)[0]->AsNumber(), (*ScaleArray)[1]->AsNumber(), (*ScaleArray)[2]->AsNumber());
		Actor->SetActorScale3D(Scale);
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetBoolField(TEXT("updated"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPActorHandlers::HandleGetProperties(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = FindActorByName(World, Name);
	if (!Actor)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name));
		return;
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("name"), Actor->GetName());
	Result->SetStringField(TEXT("label"), Actor->GetActorLabel());
	Result->SetStringField(TEXT("class"), Actor->GetClass()->GetPathName());
	Result->SetBoolField(TEXT("hidden"), Actor->IsHidden());
	Result->SetBoolField(TEXT("editable"), Actor->IsEditable());

	TArray<TSharedPtr<FJsonValue>> Components;
	for (UActorComponent* Comp : Actor->GetComponents())
	{
		if (Comp)
		{
			TSharedPtr<FJsonObject> CompObj = MakeShared<FJsonObject>();
			CompObj->SetStringField(TEXT("name"), Comp->GetName());
			CompObj->SetStringField(TEXT("class"), Comp->GetClass()->GetName());
			Components.Add(MakeShared<FJsonValueObject>(CompObj));
		}
	}
	Result->SetArrayField(TEXT("components"), Components);

	TArray<TSharedPtr<FJsonValue>> Tags;
	for (const FName& Tag : Actor->Tags)
	{
		Tags.Add(MakeShared<FJsonValueString>(Tag.ToString()));
	}
	Result->SetArrayField(TEXT("tags"), Tags);

	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPActorHandlers::HandleSetProperty(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = FindActorByName(World, Name);
	if (!Actor)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name));
		return;
	}

	FString PropertyName = Params->GetStringField(TEXT("property_name"));
	FString PropertyValue = Params->GetStringField(TEXT("property_value"));

	FProperty* Property = Actor->GetClass()->FindPropertyByName(*PropertyName);
	if (!Property)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PROPERTY"), FString::Printf(TEXT("Property not found: %s"), *PropertyName));
		return;
	}

	void* ValuePtr = Property->ContainerPtrToValuePtr<void>(Actor);
	if (!Property->ImportText_Direct(*PropertyValue, ValuePtr, Actor, PPF_None))
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("SET_FAILED"), FString::Printf(TEXT("Failed to set property %s to %s"), *PropertyName, *PropertyValue));
		return;
	}

	Actor->PostEditChange();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetStringField(TEXT("property"), PropertyName);
	Result->SetBoolField(TEXT("updated"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPActorHandlers::HandleDuplicate(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = FindActorByName(World, Name);
	if (!Actor)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name));
		return;
	}

	FVector Offset = FVector(100.0, 0.0, 0.0);
	const TArray<TSharedPtr<FJsonValue>>* OffsetArray;
	if (Params->TryGetArrayField(TEXT("offset"), OffsetArray) && OffsetArray->Num() >= 3)
	{
		Offset.X = (*OffsetArray)[0]->AsNumber();
		Offset.Y = (*OffsetArray)[1]->AsNumber();
		Offset.Z = (*OffsetArray)[2]->AsNumber();
	}

	FActorSpawnParameters SpawnParams;
	SpawnParams.Template = Actor;
	AActor* NewActor = World->SpawnActor<AActor>(Actor->GetClass(), Actor->GetActorLocation() + Offset, Actor->GetActorRotation(), SpawnParams);

	if (!NewActor)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("DUPLICATE_FAILED"), TEXT("Failed to duplicate actor"));
		return;
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("original"), Actor->GetActorLabel());
	Result->SetStringField(TEXT("duplicate_name"), NewActor->GetName());
	Result->SetStringField(TEXT("duplicate_path"), NewActor->GetPathName());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPActorHandlers::HandleBatchTransform(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	const TArray<TSharedPtr<FJsonValue>>* Operations;
	if (!Params->TryGetArrayField(TEXT("operations"), Operations))
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'operations' array is required"));
		return;
	}

	int32 SuccessCount = 0;
	int32 FailCount = 0;

	for (const TSharedPtr<FJsonValue>& OpVal : *Operations)
	{
		const TSharedPtr<FJsonObject>* OpObj;
		if (!OpVal->TryGetObject(OpObj)) { FailCount++; continue; }

		FString Name = (*OpObj)->GetStringField(TEXT("name"));
		AActor* Actor = FindActorByName(World, Name);
		if (!Actor) { FailCount++; continue; }

		const TArray<TSharedPtr<FJsonValue>>* LocArr;
		if ((*OpObj)->TryGetArrayField(TEXT("location"), LocArr) && LocArr->Num() >= 3)
		{
			Actor->SetActorLocation(FVector((*LocArr)[0]->AsNumber(), (*LocArr)[1]->AsNumber(), (*LocArr)[2]->AsNumber()));
		}

		const TArray<TSharedPtr<FJsonValue>>* RotArr;
		if ((*OpObj)->TryGetArrayField(TEXT("rotation"), RotArr) && RotArr->Num() >= 3)
		{
			Actor->SetActorRotation(FRotator((*RotArr)[0]->AsNumber(), (*RotArr)[1]->AsNumber(), (*RotArr)[2]->AsNumber()));
		}

		const TArray<TSharedPtr<FJsonValue>>* ScaleArr;
		if ((*OpObj)->TryGetArrayField(TEXT("scale"), ScaleArr) && ScaleArr->Num() >= 3)
		{
			Actor->SetActorScale3D(FVector((*ScaleArr)[0]->AsNumber(), (*ScaleArr)[1]->AsNumber(), (*ScaleArr)[2]->AsNumber()));
		}

		SuccessCount++;
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetNumberField(TEXT("success_count"), SuccessCount);
	Result->SetNumberField(TEXT("fail_count"), FailCount);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPActorHandlers::HandleAttach(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	FString ChildName = Params->GetStringField(TEXT("child"));
	FString ParentName = Params->GetStringField(TEXT("parent"));

	AActor* Child = FindActorByName(World, ChildName);
	AActor* Parent = FindActorByName(World, ParentName);

	if (!Child) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Child actor not found: %s"), *ChildName)); return; }
	if (!Parent) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Parent actor not found: %s"), *ParentName)); return; }

	Child->AttachToActor(Parent, FAttachmentTransformRules::KeepWorldTransform);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("child"), Child->GetActorLabel());
	Result->SetStringField(TEXT("parent"), Parent->GetActorLabel());
	Result->SetBoolField(TEXT("attached"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPActorHandlers::HandleDetach(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = FindActorByName(World, Name);
	if (!Actor)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name));
		return;
	}

	Actor->DetachFromActor(FDetachmentTransformRules::KeepWorldTransform);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetBoolField(TEXT("detached"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPActorHandlers::HandleAddComponent(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	FString ActorName = Params->GetStringField(TEXT("actor_name"));
	FString ComponentClass = Params->GetStringField(TEXT("component_class"));
	FString ComponentName = Params->GetStringField(TEXT("component_name"));

	AActor* Actor = FindActorByName(World, ActorName);
	if (!Actor)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *ActorName));
		return;
	}

	UClass* CompClass = FindObject<UClass>(nullptr, *ComponentClass);
	if (!CompClass) CompClass = LoadObject<UClass>(nullptr, *ComponentClass);
	if (!CompClass)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_CLASS"), FString::Printf(TEXT("Component class not found: %s"), *ComponentClass));
		return;
	}

	FName CompFName = ComponentName.IsEmpty() ? MakeUniqueObjectName(Actor, CompClass) : FName(*ComponentName);
	UActorComponent* NewComp = NewObject<UActorComponent>(Actor, CompClass, CompFName);
	if (!NewComp)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("CREATE_FAILED"), TEXT("Failed to create component"));
		return;
	}

	Actor->AddInstanceComponent(NewComp);
	NewComp->RegisterComponent();

	if (USceneComponent* SceneComp = Cast<USceneComponent>(NewComp))
	{
		SceneComp->AttachToComponent(Actor->GetRootComponent(), FAttachmentTransformRules::KeepRelativeTransform);
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetStringField(TEXT("component_name"), NewComp->GetName());
	Result->SetStringField(TEXT("component_class"), NewComp->GetClass()->GetName());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
