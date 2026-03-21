#include "Registry/MCPSafetyValidator.h"
#include "Misc/Paths.h"

FMCPSafetyValidator::FMCPSafetyValidator()
{
	ConsoleCommandDenylist.Add(TEXT("exit"));
	ConsoleCommandDenylist.Add(TEXT("quit"));
	ConsoleCommandDenylist.Add(TEXT("RestartEditor"));
	ConsoleCommandDenylist.Add(TEXT("crash"));
}

bool FMCPSafetyValidator::IsConsoleCommandAllowed(const FString& Command, FString& OutReason) const
{
	if (!bAllowConsole)
	{
		OutReason = TEXT("Console command execution is disabled in settings");
		return false;
	}

	FString TrimmedCommand = Command.TrimStartAndEnd();
	FString FirstToken;
	TrimmedCommand.Split(TEXT(" "), &FirstToken, nullptr);
	if (FirstToken.IsEmpty())
	{
		FirstToken = TrimmedCommand;
	}

	for (const FString& Denied : ConsoleCommandDenylist)
	{
		if (FirstToken.Equals(Denied, ESearchCase::IgnoreCase))
		{
			OutReason = FString::Printf(TEXT("Command '%s' is in the denylist"), *FirstToken);
			return false;
		}
	}

	return true;
}

bool FMCPSafetyValidator::IsPathWithinProject(const FString& Path) const
{
	FString AbsPath = FPaths::ConvertRelativePathToFull(Path);
	FString ProjectDir = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir());
	return AbsPath.StartsWith(ProjectDir);
}

void FMCPSafetyValidator::SetConsoleCommandDenylist(const TArray<FString>& InDenylist)
{
	ConsoleCommandDenylist = InDenylist;
}

void FMCPSafetyValidator::SetAllowConsoleCommands(bool bAllow)
{
	bAllowConsole = bAllow;
}

void FMCPSafetyValidator::SetAllowPythonExecution(bool bAllow)
{
	bAllowPython = bAllow;
}
