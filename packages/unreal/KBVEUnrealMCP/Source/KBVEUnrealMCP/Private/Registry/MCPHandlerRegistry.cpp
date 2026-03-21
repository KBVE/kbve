#include "Registry/MCPHandlerRegistry.h"
#include "Registry/MCPSafetyValidator.h"

FMCPHandlerRegistry::FMCPHandlerRegistry()
	: Validator(MakeUnique<FMCPSafetyValidator>())
{
}

FMCPHandlerRegistry::~FMCPHandlerRegistry() = default;

void FMCPHandlerRegistry::RegisterHandler(const FString& Method, FMCPHandler Handler)
{
	Handlers.Add(Method, MoveTemp(Handler));
}

bool FMCPHandlerRegistry::Dispatch(const FString& Method, const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FMCPHandler* Handler = Handlers.Find(Method);
	if (!Handler)
	{
		return false;
	}

	(*Handler)(Params, OnComplete);
	return true;
}

TArray<FString> FMCPHandlerRegistry::GetRegisteredMethods() const
{
	TArray<FString> Methods;
	Handlers.GetKeys(Methods);
	Methods.Sort();
	return Methods;
}

bool FMCPHandlerRegistry::IsMethodRegistered(const FString& Method) const
{
	return Handlers.Contains(Method);
}
