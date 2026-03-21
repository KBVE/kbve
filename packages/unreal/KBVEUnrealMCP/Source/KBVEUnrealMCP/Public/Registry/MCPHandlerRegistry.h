#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPSafetyValidator;

class KBVEUNREALMCP_API FMCPHandlerRegistry
{
public:
	FMCPHandlerRegistry();
	~FMCPHandlerRegistry();

	void RegisterHandler(const FString& Method, FMCPHandler Handler);
	bool Dispatch(const FString& Method, const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);

	TArray<FString> GetRegisteredMethods() const;
	bool IsMethodRegistered(const FString& Method) const;

	FMCPSafetyValidator& GetValidator() const { return *Validator; }

private:
	TMap<FString, FMCPHandler> Handlers;
	TUniquePtr<FMCPSafetyValidator> Validator;
};
