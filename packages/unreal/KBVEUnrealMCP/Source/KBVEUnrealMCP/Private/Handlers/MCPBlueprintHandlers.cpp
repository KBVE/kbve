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
