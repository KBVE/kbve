#pragma once

#include "CoreMinimal.h"

class KBVEUNREALMCP_API FMCPSafetyValidator
{
public:
	FMCPSafetyValidator();

	bool IsConsoleCommandAllowed(const FString& Command, FString& OutReason) const;
	bool IsPathWithinProject(const FString& Path) const;

	void SetConsoleCommandDenylist(const TArray<FString>& InDenylist);
	void SetAllowConsoleCommands(bool bAllow);
	void SetAllowPythonExecution(bool bAllow);

	bool IsPythonExecutionAllowed() const { return bAllowPython; }

private:
	TArray<FString> ConsoleCommandDenylist;
	bool bAllowConsole = true;
	bool bAllowPython = true;
};
