#include "Handlers/MCPConsoleHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Registry/MCPSafetyValidator.h"
#include "Editor.h"
#include "KBVEUnrealMCPModule.h"

void FMCPConsoleHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("console.execute"), &HandleExecute);
	Registry.RegisterHandler(TEXT("console.get_log"), &HandleGetLog);
}

void FMCPConsoleHandlers::HandleExecute(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString Command = Params->GetStringField(TEXT("command"));
	if (Command.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'command' is required"));
		return;
	}

	FMCPSafetyValidator& Validator = FKBVEUnrealMCPModule::Get().GetRegistry().GetValidator();
	FString Reason;
	if (!Validator.IsConsoleCommandAllowed(Command, Reason))
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("DENIED"), Reason);
		return;
	}

	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (World)
	{
		GEditor->Exec(World, *Command);
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("command"), Command);
	Result->SetBoolField(TEXT("executed"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPConsoleHandlers::HandleGetLog(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	int32 LineCount = (int32)Params->GetNumberField(TEXT("line_count"));
	if (LineCount <= 0) LineCount = 50;

	TArray<TSharedPtr<FJsonValue>> LogLines;

	if (GLog)
	{
		// Note: UE doesn't expose a direct log buffer API.
		// In practice, an output device would be registered to capture logs.
		// This is a placeholder that returns the log file path.
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("log_file"), FPaths::ProjectLogDir() / TEXT("Unreal.log"));
	Result->SetNumberField(TEXT("requested_lines"), LineCount);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
