#include "Handlers/MCPCodeAnalysisHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "UObject/UObjectIterator.h"
#include "UObject/Class.h"
#include "UObject/UnrealType.h"

void FMCPCodeAnalysisHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("codeanalysis.analyze_class"), &HandleAnalyzeClass);
	Registry.RegisterHandler(TEXT("codeanalysis.find_references"), &HandleFindReferences);
	Registry.RegisterHandler(TEXT("codeanalysis.search_code"), &HandleSearchCode);
	Registry.RegisterHandler(TEXT("codeanalysis.get_hierarchy"), &HandleGetHierarchy);
}

void FMCPCodeAnalysisHandlers::HandleAnalyzeClass(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString ClassName = Params->GetStringField(TEXT("class_name"));
	if (ClassName.IsEmpty()) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'class_name' is required")); return; }

	UClass* FoundClass = FindObject<UClass>(nullptr, *ClassName);
	if (!FoundClass) FoundClass = FindFirstObjectSafe<UClass>(*ClassName);
	if (!FoundClass)
	{
		// Try searching by short name
		for (TObjectIterator<UClass> It; It; ++It)
		{
			if (It->GetName() == ClassName) { FoundClass = *It; break; }
		}
	}
	if (!FoundClass) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Class not found: %s"), *ClassName)); return; }

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("class_name"), FoundClass->GetName());
	Result->SetStringField(TEXT("class_path"), FoundClass->GetPathName());
	Result->SetStringField(TEXT("parent_class"), FoundClass->GetSuperClass() ? FoundClass->GetSuperClass()->GetName() : TEXT("none"));

	// Properties
	TArray<TSharedPtr<FJsonValue>> Props;
	for (TFieldIterator<FProperty> It(FoundClass, EFieldIteratorFlags::ExcludeSuper); It; ++It)
	{
		TSharedPtr<FJsonObject> P = MakeShared<FJsonObject>();
		P->SetStringField(TEXT("name"), It->GetName());
		P->SetStringField(TEXT("type"), It->GetCPPType());
		P->SetBoolField(TEXT("blueprint_visible"), It->HasAnyPropertyFlags(CPF_BlueprintVisible));
		P->SetBoolField(TEXT("edit_anywhere"), It->HasAnyPropertyFlags(CPF_Edit));
		P->SetBoolField(TEXT("replicated"), It->HasAnyPropertyFlags(CPF_Net));
		Props.Add(MakeShared<FJsonValueObject>(P));
	}
	Result->SetArrayField(TEXT("properties"), Props);

	// Functions
	TArray<TSharedPtr<FJsonValue>> Funcs;
	for (TFieldIterator<UFunction> It(FoundClass, EFieldIteratorFlags::ExcludeSuper); It; ++It)
	{
		TSharedPtr<FJsonObject> F = MakeShared<FJsonObject>();
		F->SetStringField(TEXT("name"), It->GetName());
		F->SetBoolField(TEXT("blueprint_callable"), It->HasAnyFunctionFlags(FUNC_BlueprintCallable));
		F->SetBoolField(TEXT("is_event"), It->HasAnyFunctionFlags(FUNC_Event));
		F->SetBoolField(TEXT("is_rpc"), It->HasAnyFunctionFlags(FUNC_Net));
		F->SetNumberField(TEXT("param_count"), It->NumParms);
		Funcs.Add(MakeShared<FJsonValueObject>(F));
	}
	Result->SetArrayField(TEXT("functions"), Funcs);

	Result->SetNumberField(TEXT("property_count"), Props.Num());
	Result->SetNumberField(TEXT("function_count"), Funcs.Num());
	Result->SetBoolField(TEXT("is_abstract"), FoundClass->HasAnyClassFlags(CLASS_Abstract));
	Result->SetBoolField(TEXT("is_blueprintable"), !FoundClass->HasAnyClassFlags(CLASS_Abstract) && FoundClass->HasAnyClassFlags(CLASS_CompiledFromBlueprint) == false);

	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPCodeAnalysisHandlers::HandleFindReferences(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString ClassName = Params->GetStringField(TEXT("class_name"));
	if (ClassName.IsEmpty()) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'class_name' is required")); return; }

	UClass* FoundClass = nullptr;
	for (TObjectIterator<UClass> It; It; ++It)
	{
		if (It->GetName() == ClassName) { FoundClass = *It; break; }
	}
	if (!FoundClass) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Class not found: %s"), *ClassName)); return; }

	// Find all subclasses
	TArray<TSharedPtr<FJsonValue>> Subclasses;
	for (TObjectIterator<UClass> It; It; ++It)
	{
		if (It->IsChildOf(FoundClass) && *It != FoundClass)
		{
			TSharedPtr<FJsonObject> S = MakeShared<FJsonObject>();
			S->SetStringField(TEXT("name"), It->GetName());
			S->SetStringField(TEXT("path"), It->GetPathName());
			Subclasses.Add(MakeShared<FJsonValueObject>(S));
		}
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("class"), FoundClass->GetName());
	Result->SetArrayField(TEXT("subclasses"), Subclasses);
	Result->SetNumberField(TEXT("subclass_count"), Subclasses.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPCodeAnalysisHandlers::HandleSearchCode(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString Query = Params->GetStringField(TEXT("query"));
	if (Query.IsEmpty()) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'query' is required")); return; }

	int32 MaxResults = (int32)Params->GetNumberField(TEXT("max_results"));
	if (MaxResults <= 0) MaxResults = 50;

	TArray<TSharedPtr<FJsonValue>> Matches;
	for (TObjectIterator<UClass> It; It; ++It)
	{
		if (It->GetName().Contains(Query))
		{
			TSharedPtr<FJsonObject> M = MakeShared<FJsonObject>();
			M->SetStringField(TEXT("name"), It->GetName());
			M->SetStringField(TEXT("path"), It->GetPathName());
			M->SetStringField(TEXT("parent"), It->GetSuperClass() ? It->GetSuperClass()->GetName() : TEXT("none"));
			M->SetStringField(TEXT("type"), TEXT("class"));
			Matches.Add(MakeShared<FJsonValueObject>(M));
			if (Matches.Num() >= MaxResults) break;
		}
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("matches"), Matches);
	Result->SetNumberField(TEXT("count"), Matches.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPCodeAnalysisHandlers::HandleGetHierarchy(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString ClassName = Params->GetStringField(TEXT("class_name"));
	if (ClassName.IsEmpty()) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'class_name' is required")); return; }

	UClass* FoundClass = nullptr;
	for (TObjectIterator<UClass> It; It; ++It)
	{
		if (It->GetName() == ClassName) { FoundClass = *It; break; }
	}
	if (!FoundClass) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Class not found: %s"), *ClassName)); return; }

	// Walk up the hierarchy
	TArray<TSharedPtr<FJsonValue>> Ancestors;
	UClass* Current = FoundClass;
	while (Current)
	{
		TSharedPtr<FJsonObject> A = MakeShared<FJsonObject>();
		A->SetStringField(TEXT("name"), Current->GetName());
		A->SetStringField(TEXT("path"), Current->GetPathName());
		Ancestors.Add(MakeShared<FJsonValueObject>(A));
		Current = Current->GetSuperClass();
	}

	// Interfaces
	TArray<TSharedPtr<FJsonValue>> Interfaces;
	for (const FImplementedInterface& Iface : FoundClass->Interfaces)
	{
		if (Iface.Class)
			Interfaces.Add(MakeShared<FJsonValueString>(Iface.Class->GetName()));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("class"), FoundClass->GetName());
	Result->SetArrayField(TEXT("hierarchy"), Ancestors);
	Result->SetArrayField(TEXT("interfaces"), Interfaces);
	Result->SetNumberField(TEXT("depth"), Ancestors.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
