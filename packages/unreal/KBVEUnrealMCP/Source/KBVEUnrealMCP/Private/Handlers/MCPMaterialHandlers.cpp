#include "Handlers/MCPMaterialHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "AssetToolsModule.h"
#include "Factories/MaterialFactoryNew.h"
#include "Factories/MaterialInstanceConstantFactoryNew.h"
#include "Materials/Material.h"
#include "Materials/MaterialInstance.h"
#include "Materials/MaterialInstanceConstant.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Engine/StaticMeshActor.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PrimitiveComponent.h"
#include "EngineUtils.h"

void FMCPMaterialHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("material.create"), &HandleCreate);
	Registry.RegisterHandler(TEXT("material.modify"), &HandleModify);
	Registry.RegisterHandler(TEXT("material.apply"), &HandleApply);
	Registry.RegisterHandler(TEXT("material.get_info"), &HandleGetInfo);
	Registry.RegisterHandler(TEXT("material.set_parameter"), &HandleSetParameter);
	Registry.RegisterHandler(TEXT("material.create_instance"), &HandleCreateInstance);

	// TODO: ChiR24 — material expression graph authoring
	Registry.RegisterHandler(TEXT("material.add_expression"), MCPProtocolHelpers::MakeStub(TEXT("material.add_expression")));
	Registry.RegisterHandler(TEXT("material.connect_expressions"), MCPProtocolHelpers::MakeStub(TEXT("material.connect_expressions")));
}

void FMCPMaterialHandlers::HandleCreate(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString Name = Params->GetStringField(TEXT("name"));
	FString Path = Params->GetStringField(TEXT("path"));
	if (Name.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'name' is required"));
		return;
	}
	if (Path.IsEmpty()) Path = TEXT("/Game/Materials");

	UMaterialFactoryNew* Factory = NewObject<UMaterialFactoryNew>();
	IAssetTools& AssetTools = FModuleManager::LoadModuleChecked<FAssetToolsModule>("AssetTools").Get();
	UObject* Asset = AssetTools.CreateAsset(Name, Path, UMaterial::StaticClass(), Factory);

	UMaterial* Material = Cast<UMaterial>(Asset);
	if (!Material)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("CREATE_FAILED"), TEXT("Failed to create material"));
		return;
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("name"), Material->GetName());
	Result->SetStringField(TEXT("path"), Material->GetPathName());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPMaterialHandlers::HandleModify(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString MaterialPath = Params->GetStringField(TEXT("material_path"));
	UMaterial* Material = LoadObject<UMaterial>(nullptr, *MaterialPath);
	if (!Material)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Material not found: %s"), *MaterialPath));
		return;
	}

	FString BlendMode = Params->GetStringField(TEXT("blend_mode"));
	if (!BlendMode.IsEmpty())
	{
		if (BlendMode == TEXT("opaque")) Material->BlendMode = BLEND_Opaque;
		else if (BlendMode == TEXT("masked")) Material->BlendMode = BLEND_Masked;
		else if (BlendMode == TEXT("translucent")) Material->BlendMode = BLEND_Translucent;
		else if (BlendMode == TEXT("additive")) Material->BlendMode = BLEND_Additive;
		else if (BlendMode == TEXT("modulate")) Material->BlendMode = BLEND_Modulate;
	}

	bool bTwoSided = false;
	if (Params->TryGetBoolField(TEXT("two_sided"), bTwoSided))
	{
		Material->TwoSided = bTwoSided;
	}

	Material->PreEditChange(nullptr);
	Material->PostEditChange();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("material"), Material->GetName());
	Result->SetBoolField(TEXT("modified"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPMaterialHandlers::HandleApply(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString MaterialPath = Params->GetStringField(TEXT("material_path"));
	FString ActorName = Params->GetStringField(TEXT("actor_name"));
	int32 SlotIndex = (int32)Params->GetNumberField(TEXT("slot_index"));

	UMaterialInterface* Material = LoadObject<UMaterialInterface>(nullptr, *MaterialPath);
	if (!Material)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Material not found: %s"), *MaterialPath));
		return;
	}

	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
	{
		if (It->GetActorLabel() == ActorName || It->GetName() == ActorName)
		{
			Actor = *It;
			break;
		}
	}

	if (!Actor)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *ActorName));
		return;
	}

	UPrimitiveComponent* PrimComp = Cast<UPrimitiveComponent>(Actor->GetComponentByClass(UPrimitiveComponent::StaticClass()));
	if (!PrimComp)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_COMPONENT"), TEXT("Actor has no primitive component"));
		return;
	}

	PrimComp->SetMaterial(SlotIndex, Material);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetStringField(TEXT("material"), Material->GetName());
	Result->SetNumberField(TEXT("slot"), SlotIndex);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPMaterialHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString MaterialPath = Params->GetStringField(TEXT("material_path"));
	UMaterialInterface* Material = LoadObject<UMaterialInterface>(nullptr, *MaterialPath);
	if (!Material)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Material not found: %s"), *MaterialPath));
		return;
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("name"), Material->GetName());
	Result->SetStringField(TEXT("path"), Material->GetPathName());
	Result->SetStringField(TEXT("class"), Material->GetClass()->GetName());

	UMaterial* BaseMat = Material->GetMaterial();
	if (BaseMat)
	{
		Result->SetStringField(TEXT("blend_mode"), StaticEnum<EBlendMode>()->GetNameStringByValue((int64)BaseMat->BlendMode));
		Result->SetBoolField(TEXT("two_sided"), BaseMat->TwoSided != 0);
	}

	TArray<FMaterialParameterInfo> ParamInfos;
	TArray<FGuid> ParamIds;
	Material->GetAllScalarParameterInfo(ParamInfos, ParamIds);
	TArray<TSharedPtr<FJsonValue>> ScalarParams;
	for (const FMaterialParameterInfo& Info : ParamInfos)
	{
		float Value = 0.0f;
		Material->GetScalarParameterValue(Info, Value);
		TSharedPtr<FJsonObject> P = MakeShared<FJsonObject>();
		P->SetStringField(TEXT("name"), Info.Name.ToString());
		P->SetNumberField(TEXT("value"), Value);
		ScalarParams.Add(MakeShared<FJsonValueObject>(P));
	}
	Result->SetArrayField(TEXT("scalar_parameters"), ScalarParams);

	ParamInfos.Empty();
	ParamIds.Empty();
	Material->GetAllVectorParameterInfo(ParamInfos, ParamIds);
	TArray<TSharedPtr<FJsonValue>> VectorParams;
	for (const FMaterialParameterInfo& Info : ParamInfos)
	{
		FLinearColor Value;
		Material->GetVectorParameterValue(Info, Value);
		TSharedPtr<FJsonObject> P = MakeShared<FJsonObject>();
		P->SetStringField(TEXT("name"), Info.Name.ToString());
		TArray<TSharedPtr<FJsonValue>> ColorArr = {
			MakeShared<FJsonValueNumber>(Value.R), MakeShared<FJsonValueNumber>(Value.G),
			MakeShared<FJsonValueNumber>(Value.B), MakeShared<FJsonValueNumber>(Value.A)
		};
		P->SetArrayField(TEXT("value"), ColorArr);
		VectorParams.Add(MakeShared<FJsonValueObject>(P));
	}
	Result->SetArrayField(TEXT("vector_parameters"), VectorParams);

	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPMaterialHandlers::HandleSetParameter(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString MaterialPath = Params->GetStringField(TEXT("material_path"));
	FString ParamName = Params->GetStringField(TEXT("parameter_name"));
	FString ParamType = Params->GetStringField(TEXT("parameter_type"));

	UMaterialInstanceConstant* MIC = LoadObject<UMaterialInstanceConstant>(nullptr, *MaterialPath);
	if (!MIC)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Material instance not found (must be a MaterialInstanceConstant)"));
		return;
	}

	if (ParamType == TEXT("scalar"))
	{
		double Value = Params->GetNumberField(TEXT("value"));
		MIC->SetScalarParameterValueEditorOnly(FName(*ParamName), (float)Value);
	}
	else if (ParamType == TEXT("vector"))
	{
		const TArray<TSharedPtr<FJsonValue>>* ColorArr;
		if (Params->TryGetArrayField(TEXT("value"), ColorArr) && ColorArr->Num() >= 3)
		{
			FLinearColor Color(
				(float)(*ColorArr)[0]->AsNumber(),
				(float)(*ColorArr)[1]->AsNumber(),
				(float)(*ColorArr)[2]->AsNumber(),
				ColorArr->Num() >= 4 ? (float)(*ColorArr)[3]->AsNumber() : 1.0f
			);
			MIC->SetVectorParameterValueEditorOnly(FName(*ParamName), Color);
		}
	}
	else
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("parameter_type must be 'scalar' or 'vector'"));
		return;
	}

	MIC->PostEditChange();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("material"), MIC->GetName());
	Result->SetStringField(TEXT("parameter"), ParamName);
	Result->SetBoolField(TEXT("updated"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPMaterialHandlers::HandleCreateInstance(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString Name = Params->GetStringField(TEXT("name"));
	FString ParentPath = Params->GetStringField(TEXT("parent_material"));
	FString Path = Params->GetStringField(TEXT("path"));
	if (Name.IsEmpty() || ParentPath.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'name' and 'parent_material' are required"));
		return;
	}
	if (Path.IsEmpty()) Path = TEXT("/Game/Materials");

	UMaterialInterface* Parent = LoadObject<UMaterialInterface>(nullptr, *ParentPath);
	if (!Parent)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Parent material not found: %s"), *ParentPath));
		return;
	}

	UMaterialInstanceConstantFactoryNew* Factory = NewObject<UMaterialInstanceConstantFactoryNew>();
	Factory->InitialParent = Parent;

	IAssetTools& AssetTools = FModuleManager::LoadModuleChecked<FAssetToolsModule>("AssetTools").Get();
	UObject* Asset = AssetTools.CreateAsset(Name, Path, UMaterialInstanceConstant::StaticClass(), Factory);

	UMaterialInstanceConstant* MIC = Cast<UMaterialInstanceConstant>(Asset);
	if (!MIC)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("CREATE_FAILED"), TEXT("Failed to create material instance"));
		return;
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("name"), MIC->GetName());
	Result->SetStringField(TEXT("path"), MIC->GetPathName());
	Result->SetStringField(TEXT("parent"), Parent->GetName());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
