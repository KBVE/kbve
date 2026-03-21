#include "Handlers/MCPPythonHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Registry/MCPSafetyValidator.h"
#include "KBVEUnrealMCPModule.h"

void FMCPPythonHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("python.execute"), &HandleExecute);
	Registry.RegisterHandler(TEXT("python.evaluate"), &HandleEvaluate);
}

void FMCPPythonHandlers::HandleExecute(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString Script = Params->GetStringField(TEXT("script"));
	if (Script.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'script' is required"));
		return;
	}

	FMCPSafetyValidator& Validator = FKBVEUnrealMCPModule::Get().GetRegistry().GetValidator();
	if (!Validator.IsPythonExecutionAllowed())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("DENIED"), TEXT("Python execution is disabled in settings"));
		return;
	}

	bool bPythonAvailable = FModuleManager::Get().IsModuleLoaded(TEXT("PythonScriptPlugin"));
	if (!bPythonAvailable)
	{
		bPythonAvailable = FModuleManager::Get().ModuleExists(TEXT("PythonScriptPlugin"));
		if (bPythonAvailable)
		{
			FModuleManager::Get().LoadModule(TEXT("PythonScriptPlugin"));
			bPythonAvailable = FModuleManager::Get().IsModuleLoaded(TEXT("PythonScriptPlugin"));
		}
	}

	if (!bPythonAvailable)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_AVAILABLE"), TEXT("PythonScriptPlugin is not available. Enable it in project settings."));
		return;
	}

	bool bSuccess = GEngine->Exec(nullptr, *FString::Printf(TEXT("py \"%s\""), *Script.ReplaceCharWithEscapedChar()));

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetBoolField(TEXT("executed"), bSuccess);
	Result->SetStringField(TEXT("script"), Script.Left(200));
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPPythonHandlers::HandleEvaluate(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	// evaluate is the same as execute for now; UE's Python API doesn't
	// distinguish exec vs eval at the Exec level.
	HandleExecute(Params, OnComplete);
}
