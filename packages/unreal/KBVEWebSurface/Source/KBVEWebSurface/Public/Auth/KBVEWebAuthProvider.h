#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "UObject/Object.h"
#include "KBVEWebAuthProvider.generated.h"

DECLARE_DYNAMIC_DELEGATE_OneParam(FKBVEWebAuthTokenDelegate, const FString&, Token);

/** Interface for components that source a JWT/auth token for a web surface. */
UINTERFACE(MinimalAPI, Blueprintable)
class UKBVEWebAuthProvider : public UInterface
{
	GENERATED_BODY()
};

class KBVEWEBSURFACE_API IKBVEWebAuthProvider
{
	GENERATED_BODY()

public:
	/**
	 * Resolve a token asynchronously. Implementations may call Cb immediately
	 * with an empty string (anonymous), with a fragment-embedded value, or
	 * after a network fetch (Supabase, OAuth, etc.).
	 */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "KBVE|WebSurface|Auth")
	void ResolveToken(const FKBVEWebAuthTokenDelegate& Cb);
};

/** Always returns an empty token. Use for unauthenticated terminals (billboards, signage). */
UCLASS(BlueprintType, DisplayName = "KBVE Web Auth — Anonymous")
class KBVEWEBSURFACE_API UKBVEWebAuthProvider_Anonymous : public UObject, public IKBVEWebAuthProvider
{
	GENERATED_BODY()

public:
	virtual void ResolveToken_Implementation(const FKBVEWebAuthTokenDelegate& Cb) override;
};

/**
 * Returns a token stored on the provider. Useful for dev/debug rigs where
 * the consumer pastes a token directly and skips a real auth round-trip.
 */
UCLASS(BlueprintType, DisplayName = "KBVE Web Auth — Static")
class KBVEWEBSURFACE_API UKBVEWebAuthProvider_Static : public UObject, public IKBVEWebAuthProvider
{
	GENERATED_BODY()

public:
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Auth")
	FString Token;

	virtual void ResolveToken_Implementation(const FKBVEWebAuthTokenDelegate& Cb) override;
};
