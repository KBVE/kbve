#include "chuckSessionSubsystem.h"

#include "ROWSAuthSubsystem.h"
#include "ROWSCharacterSubsystem.h"
#include "ROWSInstanceSubsystem.h"
#include "Engine/GameInstance.h"
#include "GameFramework/PlayerController.h"

void UchuckSessionSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	UGameInstance* GI = GetGameInstance();
	if (!GI)
	{
		return;
	}

	if (UROWSAuthSubsystem* Auth = GI->GetSubsystem<UROWSAuthSubsystem>())
	{
		Auth->OnLoginSuccess.AddDynamic(this, &UchuckSessionSubsystem::HandleLoginSuccess);
		Auth->OnLoginError.AddDynamic(this, &UchuckSessionSubsystem::HandleLoginError);
	}
	if (UROWSCharacterSubsystem* Chars = GI->GetSubsystem<UROWSCharacterSubsystem>())
	{
		Chars->OnGetCharactersSuccess.AddDynamic(this, &UchuckSessionSubsystem::HandleCharactersSuccess);
		Chars->OnGetCharactersError.AddDynamic(this, &UchuckSessionSubsystem::HandleCharactersError);
		Chars->OnCreateCharacterSuccess.AddDynamic(this, &UchuckSessionSubsystem::HandleCreateSuccess);
		Chars->OnCreateCharacterError.AddDynamic(this, &UchuckSessionSubsystem::HandleMutationError);
		Chars->OnRemoveCharacterSuccess.AddDynamic(this, &UchuckSessionSubsystem::HandleRemoveSuccess);
		Chars->OnRemoveCharacterError.AddDynamic(this, &UchuckSessionSubsystem::HandleMutationError);
	}
	if (UROWSInstanceSubsystem* Instance = GI->GetSubsystem<UROWSInstanceSubsystem>())
	{
		Instance->OnGetZoneInstanceSuccess.AddDynamic(this, &UchuckSessionSubsystem::HandleZoneInstanceSuccess);
		Instance->OnGetZoneInstanceError.AddDynamic(this, &UchuckSessionSubsystem::HandleZoneInstanceError);
	}
}

void UchuckSessionSubsystem::Deinitialize()
{
	if (UGameInstance* GI = GetGameInstance())
	{
		if (UROWSAuthSubsystem* Auth = GI->GetSubsystem<UROWSAuthSubsystem>())
		{
			Auth->OnLoginSuccess.RemoveDynamic(this, &UchuckSessionSubsystem::HandleLoginSuccess);
			Auth->OnLoginError.RemoveDynamic(this, &UchuckSessionSubsystem::HandleLoginError);
		}
		if (UROWSCharacterSubsystem* Chars = GI->GetSubsystem<UROWSCharacterSubsystem>())
		{
			Chars->OnGetCharactersSuccess.RemoveDynamic(this, &UchuckSessionSubsystem::HandleCharactersSuccess);
			Chars->OnGetCharactersError.RemoveDynamic(this, &UchuckSessionSubsystem::HandleCharactersError);
			Chars->OnCreateCharacterSuccess.RemoveDynamic(this, &UchuckSessionSubsystem::HandleCreateSuccess);
			Chars->OnCreateCharacterError.RemoveDynamic(this, &UchuckSessionSubsystem::HandleMutationError);
			Chars->OnRemoveCharacterSuccess.RemoveDynamic(this, &UchuckSessionSubsystem::HandleRemoveSuccess);
			Chars->OnRemoveCharacterError.RemoveDynamic(this, &UchuckSessionSubsystem::HandleMutationError);
		}
		if (UROWSInstanceSubsystem* Instance = GI->GetSubsystem<UROWSInstanceSubsystem>())
		{
			Instance->OnGetZoneInstanceSuccess.RemoveDynamic(this, &UchuckSessionSubsystem::HandleZoneInstanceSuccess);
			Instance->OnGetZoneInstanceError.RemoveDynamic(this, &UchuckSessionSubsystem::HandleZoneInstanceError);
		}
	}
	Super::Deinitialize();
}

void UchuckSessionSubsystem::HandleLoginSuccess(const FString& InUserSessionGUID)
{
	UserSessionGUID = InUserSessionGUID;
	OnSessionReady.Broadcast(UserSessionGUID);
	RefreshCharacters();
}

void UchuckSessionSubsystem::HandleLoginError(const FString& ErrorMessage)
{
	OnSessionError.Broadcast(ErrorMessage);
}

void UchuckSessionSubsystem::RefreshCharacters()
{
	if (UserSessionGUID.IsEmpty())
	{
		return;
	}
	if (UGameInstance* GI = GetGameInstance())
	{
		if (UROWSCharacterSubsystem* Chars = GI->GetSubsystem<UROWSCharacterSubsystem>())
		{
			Chars->GetAllCharacters(UserSessionGUID);
		}
	}
}

void UchuckSessionSubsystem::HandleCharactersSuccess(const TArray<FROWSUserCharacter>& InCharacters)
{
	Characters = InCharacters;
	if (SelectedCharacter.IsEmpty() && Characters.Num() > 0)
	{
		SelectedCharacter = Characters[0].CharacterName;
	}
	OnCharactersUpdated.Broadcast(Characters);
}

void UchuckSessionSubsystem::HandleCharactersError(const FString& ErrorMessage)
{
	OnSessionError.Broadcast(ErrorMessage);
}

void UchuckSessionSubsystem::SelectCharacter(const FString& CharacterName)
{
	SelectedCharacter = CharacterName;
}

void UchuckSessionSubsystem::CreateCharacter(const FString& CharacterName, const FString& ClassName)
{
	if (UserSessionGUID.IsEmpty() || CharacterName.IsEmpty())
	{
		return;
	}
	if (UGameInstance* GI = GetGameInstance())
	{
		if (UROWSCharacterSubsystem* Chars = GI->GetSubsystem<UROWSCharacterSubsystem>())
		{
			Chars->CreateCharacter(UserSessionGUID, CharacterName, ClassName);
		}
	}
}

void UchuckSessionSubsystem::RemoveCharacter(const FString& CharacterName)
{
	if (UserSessionGUID.IsEmpty() || CharacterName.IsEmpty())
	{
		return;
	}
	if (CharacterName == SelectedCharacter)
	{
		SelectedCharacter.Reset();
	}
	if (UGameInstance* GI = GetGameInstance())
	{
		if (UROWSCharacterSubsystem* Chars = GI->GetSubsystem<UROWSCharacterSubsystem>())
		{
			Chars->RemoveCharacter(UserSessionGUID, CharacterName);
		}
	}
}

void UchuckSessionSubsystem::HandleCreateSuccess(const FROWSCreateCharacterResponse& Response)
{
	RefreshCharacters();
}

void UchuckSessionSubsystem::HandleRemoveSuccess()
{
	RefreshCharacters();
}

void UchuckSessionSubsystem::HandleMutationError(const FString& ErrorMessage)
{
	OnSessionError.Broadcast(ErrorMessage);
}

bool UchuckSessionSubsystem::RequestEnterWorld(const FString& ZoneName)
{
	if (SelectedCharacter.IsEmpty())
	{
		return false;
	}
	UGameInstance* GI = GetGameInstance();
	UROWSInstanceSubsystem* Instance = GI ? GI->GetSubsystem<UROWSInstanceSubsystem>() : nullptr;
	if (!Instance)
	{
		return false;
	}
	Instance->GetServerToConnectTo(SelectedCharacter, ZoneName);
	return true;
}

void UchuckSessionSubsystem::HandleZoneInstanceSuccess(const FROWSZoneInstance& ZoneInstance)
{
	OnServerReady.Broadcast(ZoneInstance.ServerIP, ZoneInstance.Port);

	if (ZoneInstance.ServerIP.IsEmpty() || ZoneInstance.Port <= 0)
	{
		return;
	}
	if (UGameInstance* GI = GetGameInstance())
	{
		if (APlayerController* PC = GI->GetFirstLocalPlayerController())
		{
			const FString Address = FString::Printf(TEXT("%s:%d"), *ZoneInstance.ServerIP, ZoneInstance.Port);
			PC->ClientTravel(Address, TRAVEL_Absolute);
		}
	}
}

void UchuckSessionSubsystem::HandleZoneInstanceError(const FString& ErrorMessage)
{
	OnSessionError.Broadcast(ErrorMessage);
}
