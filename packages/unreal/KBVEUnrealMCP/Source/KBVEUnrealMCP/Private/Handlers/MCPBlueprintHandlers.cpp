#include "Handlers/MCPBlueprintHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "Kismet2/KismetEditorUtilities.h"
#include "Kismet2/BlueprintEditorUtils.h"
#include "Engine/Blueprint.h"
#include "Engine/BlueprintGeneratedClass.h"
#include "EdGraphSchema_K2.h"
#include "K2Node_Event.h"
#include "K2Node_CallFunction.h"
#include "K2Node_VariableGet.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetToolsModule.h"
#include "UObject/SavePackage.h"
#include "Factories/BlueprintFactory.h"
#include "Engine/SimpleConstructionScript.h"
#include "Engine/SCS_Node.h"
#include "Kismet/KismetMathLibrary.h"
#include "Components/SceneComponent.h"

void FMCPBlueprintHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("blueprint.create"), &HandleCreate);
	Registry.RegisterHandler(TEXT("blueprint.add_component"), &HandleAddComponent);
	Registry.RegisterHandler(TEXT("blueprint.set_component_property"), &HandleSetComponentProperty);
	Registry.RegisterHandler(TEXT("blueprint.add_variable"), &HandleAddVariable);
	Registry.RegisterHandler(TEXT("blueprint.add_function_node"), &HandleAddFunctionNode);
	Registry.RegisterHandler(TEXT("blueprint.add_event_node"), &HandleAddEventNode);
	Registry.RegisterHandler(TEXT("blueprint.connect_nodes"), &HandleConnectNodes);
	Registry.RegisterHandler(TEXT("blueprint.compile"), &HandleCompile);
	// Phase 8
	Registry.RegisterHandler(TEXT("blueprint.get_graph"), &HandleGetGraph);
	Registry.RegisterHandler(TEXT("blueprint.delete_node"), &HandleDeleteNode);
	Registry.RegisterHandler(TEXT("blueprint.disconnect_pin"), &HandleDisconnectPin);
	Registry.RegisterHandler(TEXT("blueprint.set_pin_default"), &HandleSetPinDefault);
	Registry.RegisterHandler(TEXT("blueprint.set_default"), &HandleSetDefault);
	Registry.RegisterHandler(TEXT("blueprint.remove_variable"), &HandleRemoveVariable);
	Registry.RegisterHandler(TEXT("blueprint.remove_component"), &HandleRemoveComponent);
	Registry.RegisterHandler(TEXT("blueprint.reparent"), &HandleReparent);
	Registry.RegisterHandler(TEXT("blueprint.validate"), &HandleValidate);
	Registry.RegisterHandler(TEXT("blueprint.list_components"), &HandleListComponents);
	// Phase 9 — snapshot/diff/restore
	Registry.RegisterHandler(TEXT("blueprint.snapshot_graph"), &HandleSnapshotGraph);
	Registry.RegisterHandler(TEXT("blueprint.diff_graph"), &HandleDiffGraph);
	Registry.RegisterHandler(TEXT("blueprint.restore_graph"), &HandleRestoreGraph);

	// TODO: GenAISupport — bulk operations and node introspection
	Registry.RegisterHandler(TEXT("blueprint.bulk_add_nodes"), MCPProtocolHelpers::MakeStub(TEXT("blueprint.bulk_add_nodes")));
	Registry.RegisterHandler(TEXT("blueprint.get_node_suggestions"), MCPProtocolHelpers::MakeStub(TEXT("blueprint.get_node_suggestions")));
	Registry.RegisterHandler(TEXT("blueprint.get_node_guid"), MCPProtocolHelpers::MakeStub(TEXT("blueprint.get_node_guid")));
	Registry.RegisterHandler(TEXT("blueprint.add_self_reference"), MCPProtocolHelpers::MakeStub(TEXT("blueprint.add_self_reference")));
	Registry.RegisterHandler(TEXT("blueprint.add_component_reference"), MCPProtocolHelpers::MakeStub(TEXT("blueprint.add_component_reference")));
}

void FMCPBlueprintHandlers::HandleCreate(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString Name = Params->GetStringField(TEXT("name"));
	FString ParentClassPath = Params->GetStringField(TEXT("parent_class"));
	FString Path = Params->GetStringField(TEXT("path"));

	if (Name.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'name' is required"));
		return;
	}

	if (ParentClassPath.IsEmpty())
	{
		ParentClassPath = TEXT("/Script/Engine.Actor");
	}

	UClass* ParentClass = FindObject<UClass>(nullptr, *ParentClassPath);
	if (!ParentClass) ParentClass = LoadObject<UClass>(nullptr, *ParentClassPath);
	if (!ParentClass)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_CLASS"), FString::Printf(TEXT("Parent class not found: %s"), *ParentClassPath));
		return;
	}

	if (Path.IsEmpty())
	{
		Path = TEXT("/Game/Blueprints");
	}

	FString PackagePath = Path / Name;

	UBlueprintFactory* Factory = NewObject<UBlueprintFactory>();
	Factory->ParentClass = ParentClass;

	IAssetTools& AssetTools = FModuleManager::LoadModuleChecked<FAssetToolsModule>("AssetTools").Get();
	UObject* Asset = AssetTools.CreateAsset(Name, Path, UBlueprint::StaticClass(), Factory);

	UBlueprint* Blueprint = Cast<UBlueprint>(Asset);
	if (!Blueprint)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("CREATE_FAILED"), TEXT("Failed to create blueprint"));
		return;
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("blueprint_name"), Blueprint->GetName());
	Result->SetStringField(TEXT("blueprint_path"), Blueprint->GetPathName());
	Result->SetStringField(TEXT("parent_class"), ParentClass->GetPathName());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleAddComponent(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));
	FString ComponentType = Params->GetStringField(TEXT("component_type"));
	FString ComponentName = Params->GetStringField(TEXT("component_name"));

	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Blueprint not found: %s"), *BlueprintPath));
		return;
	}

	UClass* CompClass = FindObject<UClass>(nullptr, *ComponentType);
	if (!CompClass) CompClass = LoadObject<UClass>(nullptr, *ComponentType);
	if (!CompClass)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_CLASS"), FString::Printf(TEXT("Component class not found: %s"), *ComponentType));
		return;
	}

	FName CompFName = ComponentName.IsEmpty() ? FName(*CompClass->GetName()) : FName(*ComponentName);
	USCS_Node* NewNode = Blueprint->SimpleConstructionScript->CreateNode(CompClass, CompFName);
	if (!NewNode)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("ADD_FAILED"), TEXT("Failed to add component to blueprint"));
		return;
	}

	Blueprint->SimpleConstructionScript->AddNode(NewNode);
	FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(Blueprint);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("component_name"), NewNode->GetVariableName().ToString());
	Result->SetStringField(TEXT("component_class"), CompClass->GetName());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleSetComponentProperty(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));
	FString ComponentName = Params->GetStringField(TEXT("component_name"));
	FString PropertyName = Params->GetStringField(TEXT("property_name"));
	FString PropertyValue = Params->GetStringField(TEXT("property_value"));

	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Blueprint not found: %s"), *BlueprintPath));
		return;
	}

	USCS_Node* FoundNode = nullptr;
	for (USCS_Node* Node : Blueprint->SimpleConstructionScript->GetAllNodes())
	{
		if (Node->GetVariableName().ToString() == ComponentName)
		{
			FoundNode = Node;
			break;
		}
	}

	if (!FoundNode)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Component not found: %s"), *ComponentName));
		return;
	}

	UObject* Template = FoundNode->ComponentTemplate;
	if (!Template)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_TEMPLATE"), TEXT("Component has no template"));
		return;
	}

	FProperty* Property = Template->GetClass()->FindPropertyByName(*PropertyName);
	if (!Property)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PROPERTY"), FString::Printf(TEXT("Property not found: %s"), *PropertyName));
		return;
	}

	void* ValuePtr = Property->ContainerPtrToValuePtr<void>(Template);
	if (!Property->ImportText_Direct(*PropertyValue, ValuePtr, Template, PPF_None))
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("SET_FAILED"), TEXT("Failed to set property value"));
		return;
	}

	FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("component"), ComponentName);
	Result->SetStringField(TEXT("property"), PropertyName);
	Result->SetBoolField(TEXT("updated"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleAddVariable(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));
	FString VariableName = Params->GetStringField(TEXT("variable_name"));
	FString VariableType = Params->GetStringField(TEXT("variable_type"));
	bool bExposed = Params->GetBoolField(TEXT("is_exposed"));

	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Blueprint not found: %s"), *BlueprintPath));
		return;
	}

	FEdGraphPinType PinType;
	if (VariableType == TEXT("bool"))
	{
		PinType.PinCategory = UEdGraphSchema_K2::PC_Boolean;
	}
	else if (VariableType == TEXT("int") || VariableType == TEXT("int32"))
	{
		PinType.PinCategory = UEdGraphSchema_K2::PC_Int;
	}
	else if (VariableType == TEXT("float"))
	{
		PinType.PinCategory = UEdGraphSchema_K2::PC_Real;
		PinType.PinSubCategory = UEdGraphSchema_K2::PC_Float;
	}
	else if (VariableType == TEXT("string") || VariableType == TEXT("FString"))
	{
		PinType.PinCategory = UEdGraphSchema_K2::PC_String;
	}
	else if (VariableType == TEXT("vector") || VariableType == TEXT("FVector"))
	{
		PinType.PinCategory = UEdGraphSchema_K2::PC_Struct;
		PinType.PinSubCategoryObject = TBaseStructure<FVector>::Get();
	}
	else if (VariableType == TEXT("rotator") || VariableType == TEXT("FRotator"))
	{
		PinType.PinCategory = UEdGraphSchema_K2::PC_Struct;
		PinType.PinSubCategoryObject = TBaseStructure<FRotator>::Get();
	}
	else
	{
		PinType.PinCategory = UEdGraphSchema_K2::PC_Object;
		UClass* TypeClass = FindObject<UClass>(nullptr, *VariableType);
		if (!TypeClass) TypeClass = LoadObject<UClass>(nullptr, *VariableType);
		if (TypeClass)
		{
			PinType.PinSubCategoryObject = TypeClass;
		}
	}

	FName VarFName(*VariableName);
	bool bSuccess = FBlueprintEditorUtils::AddMemberVariable(Blueprint, VarFName, PinType);

	if (bSuccess && bExposed)
	{
		FBlueprintEditorUtils::SetBlueprintOnlyEditableFlag(Blueprint, VarFName, false);
		FBlueprintEditorUtils::SetInterpFlag(Blueprint, VarFName, false);
	}

	FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(Blueprint);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("variable_name"), VariableName);
	Result->SetStringField(TEXT("variable_type"), VariableType);
	Result->SetBoolField(TEXT("created"), bSuccess);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleAddFunctionNode(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));
	FString FunctionName = Params->GetStringField(TEXT("function_name"));
	FString TargetClass = Params->GetStringField(TEXT("target_class"));

	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Blueprint not found: %s"), *BlueprintPath));
		return;
	}

	UEdGraph* EventGraph = FBlueprintEditorUtils::FindEventGraph(Blueprint);
	if (!EventGraph)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_GRAPH"), TEXT("Blueprint has no event graph"));
		return;
	}

	UClass* ClassToSearch = Blueprint->GeneratedClass;
	if (!TargetClass.IsEmpty())
	{
		UClass* FoundClass = FindObject<UClass>(nullptr, *TargetClass);
		if (!FoundClass) FoundClass = LoadObject<UClass>(nullptr, *TargetClass);
		if (FoundClass) ClassToSearch = FoundClass;
	}

	UFunction* Function = ClassToSearch ? ClassToSearch->FindFunctionByName(*FunctionName) : nullptr;
	if (!Function)
	{
		Function = UKismetMathLibrary::StaticClass()->FindFunctionByName(*FunctionName);
	}

	UK2Node_CallFunction* FuncNode = NewObject<UK2Node_CallFunction>(EventGraph);
	if (Function)
	{
		FuncNode->SetFromFunction(Function);
	}
	else
	{
		FuncNode->FunctionReference.SetExternalMember(*FunctionName, ClassToSearch ? ClassToSearch : AActor::StaticClass());
	}

	int32 X = (int32)Params->GetNumberField(TEXT("node_x"));
	int32 Y = (int32)Params->GetNumberField(TEXT("node_y"));
	FuncNode->NodePosX = X;
	FuncNode->NodePosY = Y;

	EventGraph->AddNode(FuncNode, true, false);
	FuncNode->CreateNewGuid();
	FuncNode->PostPlacedNewNode();
	FuncNode->AllocateDefaultPins();

	FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("node_id"), FuncNode->NodeGuid.ToString());
	Result->SetStringField(TEXT("function_name"), FunctionName);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleAddEventNode(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));
	FString EventName = Params->GetStringField(TEXT("event_name"));

	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Blueprint not found: %s"), *BlueprintPath));
		return;
	}

	UEdGraph* EventGraph = FBlueprintEditorUtils::FindEventGraph(Blueprint);
	if (!EventGraph)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_GRAPH"), TEXT("Blueprint has no event graph"));
		return;
	}

	UK2Node_Event* EventNode = NewObject<UK2Node_Event>(EventGraph);
	EventNode->EventReference.SetExternalMember(*EventName, AActor::StaticClass());
	EventNode->bOverrideFunction = true;

	int32 X = (int32)Params->GetNumberField(TEXT("node_x"));
	int32 Y = (int32)Params->GetNumberField(TEXT("node_y"));
	EventNode->NodePosX = X;
	EventNode->NodePosY = Y;

	EventGraph->AddNode(EventNode, true, false);
	EventNode->CreateNewGuid();
	EventNode->PostPlacedNewNode();
	EventNode->AllocateDefaultPins();

	FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("node_id"), EventNode->NodeGuid.ToString());
	Result->SetStringField(TEXT("event_name"), EventName);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleConnectNodes(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));
	FString SourceNodeId = Params->GetStringField(TEXT("source_node_id"));
	FString SourcePinName = Params->GetStringField(TEXT("source_pin"));
	FString TargetNodeId = Params->GetStringField(TEXT("target_node_id"));
	FString TargetPinName = Params->GetStringField(TEXT("target_pin"));

	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Blueprint not found: %s"), *BlueprintPath));
		return;
	}

	UEdGraph* EventGraph = FBlueprintEditorUtils::FindEventGraph(Blueprint);
	if (!EventGraph)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_GRAPH"), TEXT("Blueprint has no event graph"));
		return;
	}

	FGuid SourceGuid, TargetGuid;
	FGuid::Parse(SourceNodeId, SourceGuid);
	FGuid::Parse(TargetNodeId, TargetGuid);

	UEdGraphNode* SourceNode = nullptr;
	UEdGraphNode* TargetNode = nullptr;

	for (UEdGraphNode* Node : EventGraph->Nodes)
	{
		if (Node->NodeGuid == SourceGuid) SourceNode = Node;
		if (Node->NodeGuid == TargetGuid) TargetNode = Node;
	}

	if (!SourceNode || !TargetNode)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Source or target node not found"));
		return;
	}

	UEdGraphPin* SourcePin = nullptr;
	UEdGraphPin* TargetPin = nullptr;

	for (UEdGraphPin* Pin : SourceNode->Pins)
	{
		if (Pin->PinName.ToString() == SourcePinName)
		{
			SourcePin = Pin;
			break;
		}
	}

	for (UEdGraphPin* Pin : TargetNode->Pins)
	{
		if (Pin->PinName.ToString() == TargetPinName)
		{
			TargetPin = Pin;
			break;
		}
	}

	if (!SourcePin || !TargetPin)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Source or target pin not found"));
		return;
	}

	SourcePin->MakeLinkTo(TargetPin);
	bool bConnected = SourcePin->LinkedTo.Contains(TargetPin);

	FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetBoolField(TEXT("connected"), bConnected);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleCompile(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));

	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Blueprint not found: %s"), *BlueprintPath));
		return;
	}

	FKismetEditorUtilities::CompileBlueprint(Blueprint);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("blueprint"), Blueprint->GetName());
	Result->SetBoolField(TEXT("compiled"), Blueprint->Status == BS_UpToDate);
	Result->SetStringField(TEXT("status"), Blueprint->Status == BS_UpToDate ? TEXT("success") : TEXT("error"));
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

// ─── Phase 8: Graph introspection + manipulation ────────────────────────────

void FMCPBlueprintHandlers::HandleGetGraph(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));
	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Blueprint not found: %s"), *BlueprintPath)); return; }

	UEdGraph* EventGraph = FBlueprintEditorUtils::FindEventGraph(Blueprint);
	if (!EventGraph) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_GRAPH"), TEXT("No event graph")); return; }

	TArray<TSharedPtr<FJsonValue>> Nodes;
	for (UEdGraphNode* Node : EventGraph->Nodes)
	{
		TSharedPtr<FJsonObject> N = MakeShared<FJsonObject>();
		N->SetStringField(TEXT("node_id"), Node->NodeGuid.ToString());
		N->SetStringField(TEXT("class"), Node->GetClass()->GetName());
		N->SetStringField(TEXT("title"), Node->GetNodeTitle(ENodeTitleType::FullTitle).ToString());
		N->SetNumberField(TEXT("pos_x"), Node->NodePosX);
		N->SetNumberField(TEXT("pos_y"), Node->NodePosY);
		N->SetStringField(TEXT("comment"), Node->NodeComment);

		TArray<TSharedPtr<FJsonValue>> Pins;
		for (UEdGraphPin* Pin : Node->Pins)
		{
			TSharedPtr<FJsonObject> P = MakeShared<FJsonObject>();
			P->SetStringField(TEXT("name"), Pin->PinName.ToString());
			P->SetStringField(TEXT("type"), Pin->PinType.PinCategory.ToString());
			P->SetStringField(TEXT("direction"), Pin->Direction == EGPD_Input ? TEXT("input") : TEXT("output"));
			P->SetStringField(TEXT("default_value"), Pin->DefaultValue);
			P->SetNumberField(TEXT("connections"), Pin->LinkedTo.Num());
			Pins.Add(MakeShared<FJsonValueObject>(P));
		}
		N->SetArrayField(TEXT("pins"), Pins);
		Nodes.Add(MakeShared<FJsonValueObject>(N));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("blueprint"), Blueprint->GetName());
	Result->SetStringField(TEXT("graph"), EventGraph->GetName());
	Result->SetArrayField(TEXT("nodes"), Nodes);
	Result->SetNumberField(TEXT("node_count"), Nodes.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleDeleteNode(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));
	FString NodeId = Params->GetStringField(TEXT("node_id"));
	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Blueprint not found")); return; }

	UEdGraph* EventGraph = FBlueprintEditorUtils::FindEventGraph(Blueprint);
	if (!EventGraph) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_GRAPH"), TEXT("No event graph")); return; }

	FGuid TargetGuid;
	FGuid::Parse(NodeId, TargetGuid);
	UEdGraphNode* TargetNode = nullptr;
	for (UEdGraphNode* Node : EventGraph->Nodes)
		if (Node->NodeGuid == TargetGuid) { TargetNode = Node; break; }

	if (!TargetNode) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Node not found")); return; }

	TargetNode->BreakAllNodeLinks();
	EventGraph->RemoveNode(TargetNode);
	FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("deleted_node"), NodeId);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleDisconnectPin(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));
	FString NodeId = Params->GetStringField(TEXT("node_id"));
	FString PinName = Params->GetStringField(TEXT("pin_name"));
	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Blueprint not found")); return; }

	UEdGraph* EventGraph = FBlueprintEditorUtils::FindEventGraph(Blueprint);
	if (!EventGraph) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_GRAPH"), TEXT("No event graph")); return; }

	FGuid TargetGuid;
	FGuid::Parse(NodeId, TargetGuid);
	UEdGraphNode* Node = nullptr;
	for (UEdGraphNode* N : EventGraph->Nodes)
		if (N->NodeGuid == TargetGuid) { Node = N; break; }

	if (!Node) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Node not found")); return; }

	UEdGraphPin* Pin = nullptr;
	for (UEdGraphPin* P : Node->Pins)
		if (P->PinName.ToString() == PinName) { Pin = P; break; }

	if (!Pin) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Pin not found")); return; }

	int32 BrokenCount = Pin->LinkedTo.Num();
	Pin->BreakAllPinLinks();
	FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetNumberField(TEXT("disconnected"), BrokenCount);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleSetPinDefault(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));
	FString NodeId = Params->GetStringField(TEXT("node_id"));
	FString PinName = Params->GetStringField(TEXT("pin_name"));
	FString DefaultValue = Params->GetStringField(TEXT("default_value"));

	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Blueprint not found")); return; }

	UEdGraph* EventGraph = FBlueprintEditorUtils::FindEventGraph(Blueprint);
	if (!EventGraph) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_GRAPH"), TEXT("No event graph")); return; }

	FGuid TargetGuid;
	FGuid::Parse(NodeId, TargetGuid);
	UEdGraphNode* Node = nullptr;
	for (UEdGraphNode* N : EventGraph->Nodes)
		if (N->NodeGuid == TargetGuid) { Node = N; break; }
	if (!Node) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Node not found")); return; }

	UEdGraphPin* Pin = nullptr;
	for (UEdGraphPin* P : Node->Pins)
		if (P->PinName.ToString() == PinName) { Pin = P; break; }
	if (!Pin) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Pin not found")); return; }

	Pin->DefaultValue = DefaultValue;
	FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("pin"), PinName);
	Result->SetStringField(TEXT("default_value"), DefaultValue);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleSetDefault(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));
	FString PropertyName = Params->GetStringField(TEXT("property_name"));
	FString PropertyValue = Params->GetStringField(TEXT("property_value"));

	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Blueprint not found")); return; }

	UObject* CDO = Blueprint->GeneratedClass ? Blueprint->GeneratedClass->GetDefaultObject() : nullptr;
	if (!CDO) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_CDO"), TEXT("No CDO available — compile first")); return; }

	FProperty* Prop = Blueprint->GeneratedClass->FindPropertyByName(*PropertyName);
	if (!Prop) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PROPERTY"), FString::Printf(TEXT("Property not found: %s"), *PropertyName)); return; }

	void* ValuePtr = Prop->ContainerPtrToValuePtr<void>(CDO);
	if (!Prop->ImportText_Direct(*PropertyValue, ValuePtr, CDO, PPF_None))
	{ MCPProtocolHelpers::Fail(OnComplete, TEXT("SET_FAILED"), TEXT("Failed to set default value")); return; }

	Blueprint->MarkPackageDirty();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("blueprint"), Blueprint->GetName());
	Result->SetStringField(TEXT("property"), PropertyName);
	Result->SetBoolField(TEXT("updated"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleRemoveVariable(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));
	FString VariableName = Params->GetStringField(TEXT("variable_name"));

	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Blueprint not found")); return; }

	FBlueprintEditorUtils::RemoveMemberVariable(Blueprint, FName(*VariableName));
	FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(Blueprint);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("removed"), VariableName);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleRemoveComponent(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));
	FString ComponentName = Params->GetStringField(TEXT("component_name"));

	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Blueprint not found")); return; }

	USCS_Node* FoundNode = nullptr;
	for (USCS_Node* Node : Blueprint->SimpleConstructionScript->GetAllNodes())
		if (Node->GetVariableName().ToString() == ComponentName) { FoundNode = Node; break; }

	if (!FoundNode) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Component not found: %s"), *ComponentName)); return; }

	Blueprint->SimpleConstructionScript->RemoveNode(FoundNode);
	FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(Blueprint);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("removed"), ComponentName);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleReparent(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));
	FString NewParentPath = Params->GetStringField(TEXT("new_parent_class"));

	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Blueprint not found")); return; }

	UClass* NewParent = FindObject<UClass>(nullptr, *NewParentPath);
	if (!NewParent) NewParent = LoadObject<UClass>(nullptr, *NewParentPath);
	if (!NewParent) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_CLASS"), FString::Printf(TEXT("Class not found: %s"), *NewParentPath)); return; }

	Blueprint->ParentClass = NewParent;
	FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(Blueprint);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("blueprint"), Blueprint->GetName());
	Result->SetStringField(TEXT("new_parent"), NewParent->GetName());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleValidate(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));
	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Blueprint not found")); return; }

	FKismetEditorUtilities::CompileBlueprint(Blueprint);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("blueprint"), Blueprint->GetName());
	Result->SetBoolField(TEXT("valid"), Blueprint->Status == BS_UpToDate);
	Result->SetStringField(TEXT("status"), Blueprint->Status == BS_UpToDate ? TEXT("up_to_date") :
		Blueprint->Status == BS_Error ? TEXT("error") : TEXT("dirty"));
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleListComponents(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BlueprintPath = Params->GetStringField(TEXT("blueprint_path"));
	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintPath);
	if (!Blueprint) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Blueprint not found")); return; }

	TArray<TSharedPtr<FJsonValue>> Components;
	for (USCS_Node* Node : Blueprint->SimpleConstructionScript->GetAllNodes())
	{
		TSharedPtr<FJsonObject> C = MakeShared<FJsonObject>();
		C->SetStringField(TEXT("name"), Node->GetVariableName().ToString());
		C->SetStringField(TEXT("class"), Node->ComponentClass ? Node->ComponentClass->GetName() : TEXT("unknown"));
		C->SetBoolField(TEXT("is_root"), Node == Blueprint->SimpleConstructionScript->GetDefaultSceneRootNode());
		Components.Add(MakeShared<FJsonValueObject>(C));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("components"), Components);
	Result->SetNumberField(TEXT("count"), Components.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

// ---- Phase 9: Snapshot/Diff/Restore ----

TMap<FString, FMCPBlueprintHandlers::FGraphSnapshot> FMCPBlueprintHandlers::Snapshots;

TSharedPtr<FJsonObject> FMCPBlueprintHandlers::CaptureGraphState(UEdGraph* Graph)
{
	TSharedPtr<FJsonObject> State = MakeShared<FJsonObject>();
	TArray<TSharedPtr<FJsonValue>> Nodes;

	for (UEdGraphNode* Node : Graph->Nodes)
	{
		TSharedPtr<FJsonObject> NObj = MakeShared<FJsonObject>();
		NObj->SetStringField(TEXT("id"), Node->GetName());
		NObj->SetStringField(TEXT("class"), Node->GetClass()->GetName());
		NObj->SetStringField(TEXT("title"), Node->GetNodeTitle(ENodeTitleType::FullTitle).ToString());
		NObj->SetNumberField(TEXT("x"), Node->NodePosX);
		NObj->SetNumberField(TEXT("y"), Node->NodePosY);
		NObj->SetStringField(TEXT("comment"), Node->NodeComment);

		TArray<TSharedPtr<FJsonValue>> Pins;
		for (UEdGraphPin* Pin : Node->Pins)
		{
			TSharedPtr<FJsonObject> PObj = MakeShared<FJsonObject>();
			PObj->SetStringField(TEXT("name"), Pin->PinName.ToString());
			PObj->SetStringField(TEXT("direction"), Pin->Direction == EGPD_Input ? TEXT("input") : TEXT("output"));
			PObj->SetStringField(TEXT("type"), Pin->PinType.PinCategory.ToString());
			PObj->SetStringField(TEXT("default_value"), Pin->DefaultValue);
			PObj->SetNumberField(TEXT("connections"), Pin->LinkedTo.Num());

			TArray<TSharedPtr<FJsonValue>> Links;
			for (UEdGraphPin* Linked : Pin->LinkedTo)
			{
				TSharedPtr<FJsonObject> LObj = MakeShared<FJsonObject>();
				LObj->SetStringField(TEXT("node"), Linked->GetOwningNode()->GetName());
				LObj->SetStringField(TEXT("pin"), Linked->PinName.ToString());
				Links.Add(MakeShared<FJsonValueObject>(LObj));
			}
			PObj->SetArrayField(TEXT("links"), Links);
			Pins.Add(MakeShared<FJsonValueObject>(PObj));
		}
		NObj->SetArrayField(TEXT("pins"), Pins);
		Nodes.Add(MakeShared<FJsonValueObject>(NObj));
	}

	State->SetArrayField(TEXT("nodes"), Nodes);
	State->SetNumberField(TEXT("node_count"), Graph->Nodes.Num());
	return State;
}

void FMCPBlueprintHandlers::HandleSnapshotGraph(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString Name = Params->GetStringField(TEXT("name"));
	if (Name.IsEmpty()) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'name' is required")); return; }

	FString BPPath = FString::Printf(TEXT("/Game/%s.%s"), *Name, *Name);
	UBlueprint* BP = LoadObject<UBlueprint>(nullptr, *BPPath);
	if (!BP) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Blueprint not found: %s"), *Name)); return; }

	FString GraphName = Params->GetStringField(TEXT("graph"));

	UEdGraph* Graph = nullptr;
	if (GraphName.IsEmpty())
	{
		TArray<UEdGraph*> Graphs;
		BP->GetAllGraphs(Graphs);
		if (Graphs.Num() > 0) Graph = Graphs[0];
	}
	else
	{
		TArray<UEdGraph*> Graphs;
		BP->GetAllGraphs(Graphs);
		for (UEdGraph* G : Graphs)
			if (G->GetName() == GraphName) { Graph = G; break; }
	}

	if (!Graph) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Graph not found")); return; }

	FString SnapshotKey = Params->GetStringField(TEXT("snapshot_id"));
	if (SnapshotKey.IsEmpty())
		SnapshotKey = FString::Printf(TEXT("%s_%s_%s"), *Name, *Graph->GetName(), *FDateTime::Now().ToString());

	FGraphSnapshot Snap;
	Snap.BlueprintName = Name;
	Snap.GraphName = Graph->GetName();
	Snap.Data = CaptureGraphState(Graph);
	Snap.Timestamp = FDateTime::Now();
	Snapshots.Add(SnapshotKey, Snap);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("snapshot_id"), SnapshotKey);
	Result->SetStringField(TEXT("blueprint"), Name);
	Result->SetStringField(TEXT("graph"), Graph->GetName());
	Result->SetNumberField(TEXT("node_count"), Graph->Nodes.Num());
	Result->SetStringField(TEXT("timestamp"), Snap.Timestamp.ToString());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleDiffGraph(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString SnapshotKey = Params->GetStringField(TEXT("snapshot_id"));
	if (SnapshotKey.IsEmpty()) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'snapshot_id' is required")); return; }

	FGraphSnapshot* Snap = Snapshots.Find(SnapshotKey);
	if (!Snap) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Snapshot not found: %s"), *SnapshotKey)); return; }

	FString BPPath = FString::Printf(TEXT("/Game/%s.%s"), *Snap->BlueprintName, *Snap->BlueprintName);
	UBlueprint* BP = LoadObject<UBlueprint>(nullptr, *BPPath);
	if (!BP) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Blueprint no longer exists")); return; }

	UEdGraph* Graph = nullptr;
	TArray<UEdGraph*> Graphs;
	BP->GetAllGraphs(Graphs);
	for (UEdGraph* G : Graphs)
		if (G->GetName() == Snap->GraphName) { Graph = G; break; }
	if (!Graph) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Graph no longer exists")); return; }

	TSharedPtr<FJsonObject> CurrentState = CaptureGraphState(Graph);

	// Compare node counts
	const TArray<TSharedPtr<FJsonValue>>* SnapNodes;
	const TArray<TSharedPtr<FJsonValue>>* CurNodes;
	Snap->Data->TryGetArrayField(TEXT("nodes"), SnapNodes);
	CurrentState->TryGetArrayField(TEXT("nodes"), CurNodes);

	TSet<FString> SnapNodeIds, CurNodeIds;
	TMap<FString, TSharedPtr<FJsonObject>> SnapNodeMap, CurNodeMap;

	if (SnapNodes)
		for (auto& V : *SnapNodes)
		{
			auto Obj = V->AsObject();
			FString Id = Obj->GetStringField(TEXT("id"));
			SnapNodeIds.Add(Id);
			SnapNodeMap.Add(Id, Obj);
		}

	if (CurNodes)
		for (auto& V : *CurNodes)
		{
			auto Obj = V->AsObject();
			FString Id = Obj->GetStringField(TEXT("id"));
			CurNodeIds.Add(Id);
			CurNodeMap.Add(Id, Obj);
		}

	TArray<TSharedPtr<FJsonValue>> Added, Removed, Modified;

	for (const FString& Id : CurNodeIds)
		if (!SnapNodeIds.Contains(Id))
			Added.Add(MakeShared<FJsonValueString>(Id));

	for (const FString& Id : SnapNodeIds)
		if (!CurNodeIds.Contains(Id))
			Removed.Add(MakeShared<FJsonValueString>(Id));

	for (const FString& Id : CurNodeIds.Intersect(SnapNodeIds))
	{
		auto* S = SnapNodeMap.Find(Id);
		auto* C = CurNodeMap.Find(Id);
		if (S && C)
		{
			bool bDiff = false;
			// Check position
			if ((*S)->GetNumberField(TEXT("x")) != (*C)->GetNumberField(TEXT("x")) ||
				(*S)->GetNumberField(TEXT("y")) != (*C)->GetNumberField(TEXT("y")))
				bDiff = true;

			// Check pin connections count change
			const TArray<TSharedPtr<FJsonValue>>* SPins; const TArray<TSharedPtr<FJsonValue>>* CPins;
			if ((*S)->TryGetArrayField(TEXT("pins"), SPins) && (*C)->TryGetArrayField(TEXT("pins"), CPins))
			{
				if (SPins->Num() != CPins->Num()) bDiff = true;
			}

			if (bDiff)
				Modified.Add(MakeShared<FJsonValueString>(Id));
		}
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("snapshot_id"), SnapshotKey);
	Result->SetArrayField(TEXT("added_nodes"), Added);
	Result->SetArrayField(TEXT("removed_nodes"), Removed);
	Result->SetArrayField(TEXT("modified_nodes"), Modified);
	Result->SetNumberField(TEXT("snapshot_node_count"), SnapNodeIds.Num());
	Result->SetNumberField(TEXT("current_node_count"), CurNodeIds.Num());
	Result->SetBoolField(TEXT("has_changes"), Added.Num() > 0 || Removed.Num() > 0 || Modified.Num() > 0);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPBlueprintHandlers::HandleRestoreGraph(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString SnapshotKey = Params->GetStringField(TEXT("snapshot_id"));
	if (SnapshotKey.IsEmpty()) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'snapshot_id' is required")); return; }

	FGraphSnapshot* Snap = Snapshots.Find(SnapshotKey);
	if (!Snap) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Snapshot not found: %s"), *SnapshotKey)); return; }

	FString BPPath = FString::Printf(TEXT("/Game/%s.%s"), *Snap->BlueprintName, *Snap->BlueprintName);
	UBlueprint* BP = LoadObject<UBlueprint>(nullptr, *BPPath);
	if (!BP) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Blueprint no longer exists")); return; }

	UEdGraph* Graph = nullptr;
	TArray<UEdGraph*> Graphs;
	BP->GetAllGraphs(Graphs);
	for (UEdGraph* G : Graphs)
		if (G->GetName() == Snap->GraphName) { Graph = G; break; }
	if (!Graph) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), TEXT("Graph no longer exists")); return; }

	// Restore pin connections from snapshot
	const TArray<TSharedPtr<FJsonValue>>* SnapNodes;
	if (!Snap->Data->TryGetArrayField(TEXT("nodes"), SnapNodes))
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("CORRUPT"), TEXT("Snapshot data is corrupt"));
		return;
	}

	int32 RestoredConnections = 0;

	// Build map of current nodes
	TMap<FString, UEdGraphNode*> NodeMap;
	for (UEdGraphNode* Node : Graph->Nodes)
		NodeMap.Add(Node->GetName(), Node);

	// Rewire connections from snapshot
	for (auto& NodeVal : *SnapNodes)
	{
		auto NodeObj = NodeVal->AsObject();
		FString NodeId = NodeObj->GetStringField(TEXT("id"));
		UEdGraphNode** NodePtr = NodeMap.Find(NodeId);
		if (!NodePtr) continue;

		const TArray<TSharedPtr<FJsonValue>>* PinsArr;
		if (!NodeObj->TryGetArrayField(TEXT("pins"), PinsArr)) continue;

		for (auto& PinVal : *PinsArr)
		{
			auto PinObj = PinVal->AsObject();
			FString PinName = PinObj->GetStringField(TEXT("name"));
			FString Dir = PinObj->GetStringField(TEXT("direction"));
			if (Dir != TEXT("output")) continue; // Only restore from output side

			UEdGraphPin* SrcPin = nullptr;
			for (UEdGraphPin* P : (*NodePtr)->Pins)
				if (P->PinName.ToString() == PinName && P->Direction == EGPD_Output) { SrcPin = P; break; }
			if (!SrcPin) continue;

			const TArray<TSharedPtr<FJsonValue>>* LinksArr;
			if (!PinObj->TryGetArrayField(TEXT("links"), LinksArr)) continue;

			for (auto& LinkVal : *LinksArr)
			{
				auto LinkObj = LinkVal->AsObject();
				FString TargetNodeId = LinkObj->GetStringField(TEXT("node"));
				FString TargetPinName = LinkObj->GetStringField(TEXT("pin"));

				UEdGraphNode** TargetNodePtr = NodeMap.Find(TargetNodeId);
				if (!TargetNodePtr) continue;

				UEdGraphPin* TgtPin = nullptr;
				for (UEdGraphPin* P : (*TargetNodePtr)->Pins)
					if (P->PinName.ToString() == TargetPinName && P->Direction == EGPD_Input) { TgtPin = P; break; }
				if (!TgtPin) continue;

				// Check if already connected
				if (!SrcPin->LinkedTo.Contains(TgtPin))
				{
					SrcPin->MakeLinkTo(TgtPin);
					RestoredConnections++;
				}
			}
		}
	}

	FBlueprintEditorUtils::MarkBlueprintAsModified(BP);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("snapshot_id"), SnapshotKey);
	Result->SetNumberField(TEXT("restored_connections"), RestoredConnections);
	Result->SetBoolField(TEXT("restored"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
