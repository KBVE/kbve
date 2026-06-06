#include "Auth/KBVEWebAuthProvider.h"

void UKBVEWebAuthProvider_Anonymous::ResolveToken_Implementation(const FKBVEWebAuthTokenDelegate& Cb)
{
	Cb.ExecuteIfBound(FString());
}

void UKBVEWebAuthProvider_Static::ResolveToken_Implementation(const FKBVEWebAuthTokenDelegate& Cb)
{
	Cb.ExecuteIfBound(Token);
}
