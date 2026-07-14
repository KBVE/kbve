# RentEarth ARPG Phase 4 — Shortcut Login + Live Point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-client username-setup gate for first-time players, persist the username via the axum-kbve profile endpoint, refresh the Supabase session so the JWT carries the `kbve_username` claim, and point the rentearth client at the live Agones ARPG ingress.

**Architecture:** All changes live in the rentearth `chuck` fork (`apps/rentearth/unreal-rentearth/Source/chuck`). A new `UchuckKbveApiClient` GameInstanceSubsystem POSTs the chosen name to `/api/v1/profile/username`; a new `SchuckUsernameSetup` Slate widget drives set → refresh → proceed; `AchuckMenuPlayerController` gains a three-state auth gate (login → username → play); `AchuckSimgridController::ServerUrl` defaults to the live ingress.

**Tech Stack:** UE5.8 C++, Slate, `FHttpModule`, `FJsonSerializer`, `UKBVESupabaseSubsystem`, UE automation tests.

## Global Constraints

- All new/edited code lives in the rentearth chuck fork `apps/rentearth/unreal-rentearth/Source/chuck` — do NOT touch main chuck (`apps/chuckrpg/unreal-chuck`).
- No code comments anywhere (project rule).
- Endpoint: `POST {BaseUrl}/api/v1/profile/username`, header `Authorization: Bearer <access token>`, body `{"username":"<name>"}`. Responses: 200 ok, 400 invalid, 401 unauthorized, 409 taken, 503 server unavailable.
- Live ARPG endpoint: `wss://arpg.kbve.com/ws` (fixed ingress). Local dev override: `ws://localhost:7979/ws`.
- `chuck.Build.cs` already depends on `HTTP`, `Json`, `JsonUtilities`, `KBVESupabase`, `KBVEUIAuth`, `Slate`, `SlateCore`, `KBVESimgrid` — no Build.cs edits needed.
- Username persistence requires a session refresh afterward: `UKBVESupabaseSubsystem::RefreshSession()` re-mints the JWT with the `kbve_username` claim.
- Result enum: `enum class EchuckSetUsernameResult : uint8 { Ok, Taken, Invalid, Unauthorized, ServerError, NetworkError }`.
- Test macro pattern (from `SimgridCobsTests.cpp`): `#if WITH_DEV_AUTOMATION_TESTS` guard, `IMPLEMENT_SIMPLE_AUTOMATION_TEST(Class, "Category.Path", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)`, `bool Class::RunTest(const FString&)`, tests in `Private`/`Tests` co-located `.cpp`.
- Build/test via UE `Build.sh` + `UnrealEditor-Cmd` automation (nx unavailable in worktree). Before automation runs: `pkill -9 -f UnrealEditor-Cmd; rm -f /tmp/UnrealEditor-Cmd*`.

---

### Task 1: `UchuckKbveApiClient` — enum, config, pure parse + tests

**Files:**
- Create: `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckKbveApiClient.h`
- Create: `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckKbveApiClient.cpp`
- Test: `apps/rentearth/unreal-rentearth/Source/chuck/Net/Tests/chuckKbveApiTests.cpp`

**Interfaces:**
- Consumes: nothing (leaf).
- Produces:
  - `enum class EchuckSetUsernameResult : uint8 { Ok, Taken, Invalid, Unauthorized, ServerError, NetworkError };`
  - `UCLASS(Config=Game) class UchuckKbveApiClient : public UGameInstanceSubsystem` with `UPROPERTY(Config) FString BaseUrl = TEXT("https://kbve.com");`
  - `static EchuckSetUsernameResult UchuckKbveApiClient::ParseSetUsernameResult(int32 HttpCode, const FString& Body, const FString& Requested, FString& OutCanonical);`
  - `void SetUsername(const FString& Name, TFunction<void(EchuckSetUsernameResult, const FString&)> OnResult);` (declared here, implemented in Task 2)

- [ ] **Step 1: Write the header**

Create `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckKbveApiClient.h`:

```cpp
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "chuckKbveApiClient.generated.h"

UENUM()
enum class EchuckSetUsernameResult : uint8
{
	Ok,
	Taken,
	Invalid,
	Unauthorized,
	ServerError,
	NetworkError
};

UCLASS(Config = Game)
class UchuckKbveApiClient : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UPROPERTY(Config, EditDefaultsOnly, Category = "Chuck|Api")
	FString BaseUrl = TEXT("https://kbve.com");

	void SetUsername(const FString& Name, TFunction<void(EchuckSetUsernameResult, const FString&)> OnResult);

	static EchuckSetUsernameResult ParseSetUsernameResult(int32 HttpCode, const FString& Body, const FString& Requested, FString& OutCanonical);
};
```

- [ ] **Step 2: Write the pure-parse implementation (SetUsername left as a stub for Task 2)**

Create `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckKbveApiClient.cpp`:

```cpp
#include "chuckKbveApiClient.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

EchuckSetUsernameResult UchuckKbveApiClient::ParseSetUsernameResult(int32 HttpCode, const FString& Body, const FString& Requested, FString& OutCanonical)
{
	OutCanonical = Requested;

	switch (HttpCode)
	{
	case 200:
	{
		TSharedPtr<FJsonObject> Json;
		const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
		if (FJsonSerializer::Deserialize(Reader, Json) && Json.IsValid())
		{
			FString Canon;
			if (Json->TryGetStringField(TEXT("username"), Canon) && !Canon.IsEmpty())
			{
				OutCanonical = Canon;
			}
		}
		return EchuckSetUsernameResult::Ok;
	}
	case 400:
		return EchuckSetUsernameResult::Invalid;
	case 401:
		return EchuckSetUsernameResult::Unauthorized;
	case 409:
		return EchuckSetUsernameResult::Taken;
	case 503:
		return EchuckSetUsernameResult::ServerError;
	default:
		return EchuckSetUsernameResult::ServerError;
	}
}

void UchuckKbveApiClient::SetUsername(const FString& Name, TFunction<void(EchuckSetUsernameResult, const FString&)> OnResult)
{
	if (OnResult)
	{
		OnResult(EchuckSetUsernameResult::NetworkError, Name);
	}
}
```

- [ ] **Step 3: Write the failing tests**

Create `apps/rentearth/unreal-rentearth/Source/chuck/Net/Tests/chuckKbveApiTests.cpp`:

```cpp
#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "chuckKbveApiClient.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FchuckKbveApiParseOkTest,
	"Chuck.KbveApi.ParseSetUsername.Ok",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FchuckKbveApiParseOkTest::RunTest(const FString& Parameters)
{
	FString Canonical;
	const EchuckSetUsernameResult R = UchuckKbveApiClient::ParseSetUsernameResult(
		200, TEXT("{\"success\":true,\"username\":\"chad\",\"message\":\"ok\"}"), TEXT("chad_req"), Canonical);
	TestEqual("200 -> Ok", (int32)R, (int32)EchuckSetUsernameResult::Ok);
	TestEqual("canonical from body", Canonical, FString(TEXT("chad")));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FchuckKbveApiParseOkNoFieldTest,
	"Chuck.KbveApi.ParseSetUsername.OkNoField",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FchuckKbveApiParseOkNoFieldTest::RunTest(const FString& Parameters)
{
	FString Canonical;
	const EchuckSetUsernameResult R = UchuckKbveApiClient::ParseSetUsernameResult(
		200, TEXT("{\"success\":true}"), TEXT("chad_req"), Canonical);
	TestEqual("200 no field -> Ok", (int32)R, (int32)EchuckSetUsernameResult::Ok);
	TestEqual("canonical falls back to requested", Canonical, FString(TEXT("chad_req")));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FchuckKbveApiParseCodesTest,
	"Chuck.KbveApi.ParseSetUsername.Codes",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FchuckKbveApiParseCodesTest::RunTest(const FString& Parameters)
{
	FString Canonical;
	TestEqual("400 -> Invalid", (int32)UchuckKbveApiClient::ParseSetUsernameResult(400, TEXT(""), TEXT("n"), Canonical), (int32)EchuckSetUsernameResult::Invalid);
	TestEqual("401 -> Unauthorized", (int32)UchuckKbveApiClient::ParseSetUsernameResult(401, TEXT(""), TEXT("n"), Canonical), (int32)EchuckSetUsernameResult::Unauthorized);
	TestEqual("409 -> Taken", (int32)UchuckKbveApiClient::ParseSetUsernameResult(409, TEXT(""), TEXT("n"), Canonical), (int32)EchuckSetUsernameResult::Taken);
	TestEqual("503 -> ServerError", (int32)UchuckKbveApiClient::ParseSetUsernameResult(503, TEXT(""), TEXT("n"), Canonical), (int32)EchuckSetUsernameResult::ServerError);
	TestEqual("500 -> ServerError", (int32)UchuckKbveApiClient::ParseSetUsernameResult(500, TEXT(""), TEXT("n"), Canonical), (int32)EchuckSetUsernameResult::ServerError);
	return true;
}

#endif
```

- [ ] **Step 4: Build the editor target and run the tests**

Before running, clear any stale singleton:

```bash
pkill -9 -f UnrealEditor-Cmd 2>/dev/null; rm -f /tmp/UnrealEditor-Cmd* 2>/dev/null
```

Build `rentearthEditor` (adjust the engine `Build.sh` path to the machine's UE 5.8 install), then run:

```
UnrealEditor-Cmd <path>/rentearth.uproject -ExecCmds="Automation RunTests Chuck.KbveApi; Quit" -unattended -nop4 -nullrhi -log
```

Expected: `Chuck.KbveApi.ParseSetUsername.Ok`, `.OkNoField`, `.Codes` all PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckKbveApiClient.h \
        apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckKbveApiClient.cpp \
        apps/rentearth/unreal-rentearth/Source/chuck/Net/Tests/chuckKbveApiTests.cpp
git commit -m "feat(rentearth): kbve api client username result parse + tests"
```

---

### Task 2: `UchuckKbveApiClient::SetUsername` — HTTP POST

**Files:**
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckKbveApiClient.cpp`

**Interfaces:**
- Consumes: `UKBVESupabaseSubsystem::GetAccessToken()` (returns `FString`), `UGameInstanceSubsystem::GetGameInstance()`, `ParseSetUsernameResult` from Task 1.
- Produces: working `SetUsername` that issues the POST and invokes `OnResult` with the parsed result + canonical name.

- [ ] **Step 1: Replace the SetUsername stub with the real implementation**

In `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckKbveApiClient.cpp`, add these includes at the top (below the existing includes):

```cpp
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Engine/GameInstance.h"
#include "KBVESupabaseSubsystem.h"
```

Replace the entire stub `SetUsername` body with:

```cpp
void UchuckKbveApiClient::SetUsername(const FString& Name, TFunction<void(EchuckSetUsernameResult, const FString&)> OnResult)
{
	UGameInstance* GI = GetGameInstance();
	UKBVESupabaseSubsystem* Supa = GI ? GI->GetSubsystem<UKBVESupabaseSubsystem>() : nullptr;
	const FString Token = Supa ? Supa->GetAccessToken() : FString();

	TSharedRef<FJsonObject> BodyJson = MakeShared<FJsonObject>();
	BodyJson->SetStringField(TEXT("username"), Name);
	FString BodyStr;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&BodyStr);
	FJsonSerializer::Serialize(BodyJson, Writer);

	const FString Requested = Name;

	const TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = FHttpModule::Get().CreateRequest();
	Req->SetVerb(TEXT("POST"));
	Req->SetURL(BaseUrl + TEXT("/api/v1/profile/username"));
	Req->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Req->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *Token));
	Req->SetContentAsString(BodyStr);
	Req->OnProcessRequestComplete().BindLambda(
		[OnResult, Requested](FHttpRequestPtr, FHttpResponsePtr Resp, bool bConnected)
		{
			FString Canonical = Requested;
			EchuckSetUsernameResult Result;
			if (!bConnected || !Resp.IsValid())
			{
				Result = EchuckSetUsernameResult::NetworkError;
			}
			else
			{
				Result = ParseSetUsernameResult(Resp->GetResponseCode(), Resp->GetContentAsString(), Requested, Canonical);
			}
			if (OnResult)
			{
				OnResult(Result, Canonical);
			}
		});
	Req->ProcessRequest();
}
```

Add the JSON writer include if not already present (it is used for serialization):

```cpp
#include "Serialization/JsonWriter.h"
```

- [ ] **Step 2: Rebuild the editor target**

```bash
pkill -9 -f UnrealEditor-Cmd 2>/dev/null; rm -f /tmp/UnrealEditor-Cmd* 2>/dev/null
```

Build `rentearthEditor`. Expected: compiles clean. Re-run `Automation RunTests Chuck.KbveApi` — the 3 Task 1 tests still PASS (the pure parse fn is unchanged).

- [ ] **Step 3: Commit**

```bash
git add apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckKbveApiClient.cpp
git commit -m "feat(rentearth): kbve api client SetUsername POST /api/v1/profile/username"
```

---

### Task 3: `SchuckUsernameSetup` Slate widget

**Files:**
- Create: `apps/rentearth/unreal-rentearth/Source/chuck/UI/SchuckUsernameSetup.h`
- Create: `apps/rentearth/unreal-rentearth/Source/chuck/UI/SchuckUsernameSetup.cpp`

**Interfaces:**
- Consumes: `UchuckKbveApiClient::SetUsername` + `EchuckSetUsernameResult` (Task 2), `UKBVESupabaseSubsystem::RefreshSession()`.
- Produces: `SchuckUsernameSetup` widget with `SLATE_ARGUMENT(TWeakObjectPtr<UKBVESupabaseSubsystem>, Subsystem)`, `SLATE_ARGUMENT(TWeakObjectPtr<UchuckKbveApiClient>, ApiClient)`, `SLATE_EVENT(FSimpleDelegate, OnUsernameSet)`, `SLATE_EVENT(FSimpleDelegate, OnSessionExpired)`.

- [ ] **Step 1: Write the header**

Create `apps/rentearth/unreal-rentearth/Source/chuck/UI/SchuckUsernameSetup.h`:

```cpp
#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"

class UKBVESupabaseSubsystem;
class UchuckKbveApiClient;
class SEditableTextBox;
class STextBlock;
class SButton;

class SchuckUsernameSetup : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckUsernameSetup) {}
		SLATE_ARGUMENT(TWeakObjectPtr<UKBVESupabaseSubsystem>, Subsystem)
		SLATE_ARGUMENT(TWeakObjectPtr<UchuckKbveApiClient>, ApiClient)
		SLATE_EVENT(FSimpleDelegate, OnUsernameSet)
		SLATE_EVENT(FSimpleDelegate, OnSessionExpired)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	FReply HandleConfirm();
	void SetStatus(const FText& Text);
	void SetBusy(bool bInBusy);

	TWeakObjectPtr<UKBVESupabaseSubsystem> Subsystem;
	TWeakObjectPtr<UchuckKbveApiClient> ApiClient;
	FSimpleDelegate OnUsernameSet;
	FSimpleDelegate OnSessionExpired;
	TSharedPtr<SEditableTextBox> NameBox;
	TSharedPtr<STextBlock> StatusText;
	TSharedPtr<SButton> ConfirmButton;
	bool bBusy = false;
};
```

- [ ] **Step 2: Write the implementation**

Create `apps/rentearth/unreal-rentearth/Source/chuck/UI/SchuckUsernameSetup.cpp`:

```cpp
#include "SchuckUsernameSetup.h"
#include "Net/chuckKbveApiClient.h"
#include "KBVESupabaseSubsystem.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Text/STextBlock.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Layout/SBox.h"
#include "Styling/CoreStyle.h"

#define LOCTEXT_NAMESPACE "SchuckUsernameSetup"

void SchuckUsernameSetup::Construct(const FArguments& InArgs)
{
	Subsystem = InArgs._Subsystem;
	ApiClient = InArgs._ApiClient;
	OnUsernameSet = InArgs._OnUsernameSet;
	OnSessionExpired = InArgs._OnSessionExpired;

	const FSlateFontInfo TitleFont = FCoreStyle::GetDefaultFontStyle("Bold", 22);
	const FSlateFontInfo StatusFont = FCoreStyle::GetDefaultFontStyle("Regular", 10);

	NameBox = SNew(SEditableTextBox).HintText(LOCTEXT("NameHint", "choose a username"));
	StatusText = SNew(STextBlock).Font(StatusFont).Text(FText::GetEmpty());
	ConfirmButton = SNew(SButton)
		.HAlign(HAlign_Center).VAlign(VAlign_Center)
		.OnClicked(FOnClicked::CreateSP(this, &SchuckUsernameSetup::HandleConfirm))
		[
			SNew(STextBlock).Text(LOCTEXT("Confirm", "Set Username"))
		];

	ChildSlot
	.HAlign(HAlign_Center).VAlign(VAlign_Center)
	[
		SNew(SBox).WidthOverride(360.f)
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 0.f, 0.f, 12.f)
			[
				SNew(STextBlock).Font(TitleFont).Text(LOCTEXT("Title", "Pick a username"))
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 8.f)
			[
				NameBox.ToSharedRef()
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 8.f)
			[
				ConfirmButton.ToSharedRef()
			]
			+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
			[
				StatusText.ToSharedRef()
			]
		]
	];
}

void SchuckUsernameSetup::SetStatus(const FText& Text)
{
	if (StatusText.IsValid())
	{
		StatusText->SetText(Text);
	}
}

void SchuckUsernameSetup::SetBusy(bool bInBusy)
{
	bBusy = bInBusy;
	if (NameBox.IsValid())
	{
		NameBox->SetEnabled(!bInBusy);
	}
	if (ConfirmButton.IsValid())
	{
		ConfirmButton->SetEnabled(!bInBusy);
	}
}

FReply SchuckUsernameSetup::HandleConfirm()
{
	if (bBusy)
	{
		return FReply::Handled();
	}

	const FString Name = NameBox.IsValid() ? NameBox->GetText().ToString() : FString();
	if (Name.IsEmpty())
	{
		SetStatus(LOCTEXT("Empty", "Enter a username"));
		return FReply::Handled();
	}

	UchuckKbveApiClient* Api = ApiClient.Get();
	if (!Api)
	{
		SetStatus(LOCTEXT("NoApi", "Client unavailable"));
		return FReply::Handled();
	}

	SetBusy(true);
	SetStatus(LOCTEXT("Setting", "Setting..."));

	TWeakPtr<SchuckUsernameSetup> WeakSelf = SharedThis(this);
	Api->SetUsername(Name, [WeakSelf](EchuckSetUsernameResult Result, const FString& Canonical)
	{
		TSharedPtr<SchuckUsernameSetup> Self = WeakSelf.Pin();
		if (!Self.IsValid())
		{
			return;
		}
		switch (Result)
		{
		case EchuckSetUsernameResult::Ok:
			if (UKBVESupabaseSubsystem* Sub = Self->Subsystem.Get())
			{
				Sub->RefreshSession();
			}
			Self->OnUsernameSet.ExecuteIfBound();
			break;
		case EchuckSetUsernameResult::Taken:
			Self->SetStatus(LOCTEXT("Taken", "Username taken - try another"));
			Self->SetBusy(false);
			break;
		case EchuckSetUsernameResult::Invalid:
			Self->SetStatus(LOCTEXT("Invalid", "Invalid username"));
			Self->SetBusy(false);
			break;
		case EchuckSetUsernameResult::Unauthorized:
			Self->OnSessionExpired.ExecuteIfBound();
			break;
		default:
			Self->SetStatus(LOCTEXT("ServerErr", "Server unavailable - try again"));
			Self->SetBusy(false);
			break;
		}
	});

	return FReply::Handled();
}

#undef LOCTEXT_NAMESPACE
```

- [ ] **Step 3: Rebuild the editor target**

```bash
pkill -9 -f UnrealEditor-Cmd 2>/dev/null; rm -f /tmp/UnrealEditor-Cmd* 2>/dev/null
```

Build `rentearthEditor`. Expected: compiles clean (Slate widget, no automation test for UI).

- [ ] **Step 4: Commit**

```bash
git add apps/rentearth/unreal-rentearth/Source/chuck/UI/SchuckUsernameSetup.h \
        apps/rentearth/unreal-rentearth/Source/chuck/UI/SchuckUsernameSetup.cpp
git commit -m "feat(rentearth): username setup slate widget"
```

---

### Task 4: `AchuckMenuPlayerController` three-state auth gate

**Files:**
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/UI/chuckMenuPlayerController.h`
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/UI/chuckMenuPlayerController.cpp`

**Interfaces:**
- Consumes: `SchuckUsernameSetup` (Task 3), `UchuckKbveApiClient` (Task 2), `UKBVESupabaseSubsystem::GetUser().KbveUsername`, `IsSignedIn()`, `SignOut()`, `GetSession()`.
- Produces: three-state `RefreshAuthVisibility(bool bSignedIn)` — login when unauth, username setup when signed-in with empty `KbveUsername`, account/play when signed-in with a username.

- [ ] **Step 1: Edit the header**

In `apps/rentearth/unreal-rentearth/Source/chuck/UI/chuckMenuPlayerController.h`:

Add forward declarations alongside the existing widget forward decls (near `class SKBVELoginWidget;`):

```cpp
class SchuckUsernameSetup;
class UchuckKbveApiClient;
```

Add these two private handler declarations next to the existing `HandleSupabase*` UFUNCTIONs (they are plain methods, not UFUNCTIONs — `FSimpleDelegate` binds via `CreateUObject` without requiring UFUNCTION):

```cpp
	void HandleUsernameSet();
	void HandleUsernameSessionExpired();
```

Add these two members next to the existing `TSharedPtr<SKBVELoginWidget> LoginWidget;`:

```cpp
	TSharedPtr<SchuckUsernameSetup> UsernameWidget;
	TWeakObjectPtr<UchuckKbveApiClient> ApiClient;
```

- [ ] **Step 2: Edit the .cpp — includes**

In `apps/rentearth/unreal-rentearth/Source/chuck/UI/chuckMenuPlayerController.cpp`, add includes near the existing widget includes:

```cpp
#include "SchuckUsernameSetup.h"
#include "Net/chuckKbveApiClient.h"
```

- [ ] **Step 3: Edit the .cpp — construct the widget in BeginPlay**

In `BeginPlay`, immediately after the `LoginWidget = SNew(SKBVELoginWidget)...;` construction, add:

```cpp
	if (UGameInstance* GI = GetGameInstance())
	{
		ApiClient = GI->GetSubsystem<UchuckKbveApiClient>();
	}
	UsernameWidget = SNew(SchuckUsernameSetup)
		.Subsystem(SupabaseSubsystem)
		.ApiClient(ApiClient)
		.OnUsernameSet(FSimpleDelegate::CreateUObject(this, &AchuckMenuPlayerController::HandleUsernameSet))
		.OnSessionExpired(FSimpleDelegate::CreateUObject(this, &AchuckMenuPlayerController::HandleUsernameSessionExpired));
	UsernameWidget->SetVisibility(EVisibility::Collapsed);
```

In the `AddViewportWidgetContent` block, add the username widget between Login (45) and CharSelect (50):

```cpp
		Viewport->AddViewportWidgetContent(UsernameWidget.ToSharedRef(), 46);
```

- [ ] **Step 4: Edit the .cpp — three-state RefreshAuthVisibility**

Replace the existing `RefreshAuthVisibility` body with:

```cpp
void AchuckMenuPlayerController::RefreshAuthVisibility(bool bSignedIn)
{
	UKBVESupabaseSubsystem* Sub = SupabaseSubsystem.Get();
	const bool bHasUsername = Sub && !Sub->GetUser().KbveUsername.IsEmpty();
	const bool bNeedUsername = bSignedIn && !bHasUsername;

	if (LoginWidget.IsValid())
	{
		LoginWidget->SetVisibility(bSignedIn ? EVisibility::Collapsed : EVisibility::Visible);
	}
	if (UsernameWidget.IsValid())
	{
		UsernameWidget->SetVisibility(bNeedUsername ? EVisibility::Visible : EVisibility::Collapsed);
	}
	if (AccountWidget.IsValid())
	{
		AccountWidget->SetVisibility((bSignedIn && bHasUsername) ? EVisibility::SelfHitTestInvisible : EVisibility::Collapsed);
	}
}
```

- [ ] **Step 5: Edit the .cpp — ensure session-refresh recomputes, add handlers**

Ensure `HandleSupabaseSessionRefreshed` ends by recomputing visibility. Its body should be (preserve any existing `ApplyAccountFromSession` call already there):

```cpp
void AchuckMenuPlayerController::HandleSupabaseSessionRefreshed(const FKBVESupabaseSession& Session)
{
	ApplyAccountFromSession(Session);
	RefreshAuthVisibility(true);
}
```

Add the two new handlers (near the other `HandleSupabase*` definitions):

```cpp
void AchuckMenuPlayerController::HandleUsernameSet()
{
	UKBVESupabaseSubsystem* Sub = SupabaseSubsystem.Get();
	RefreshAuthVisibility(Sub && Sub->IsSignedIn());
}

void AchuckMenuPlayerController::HandleUsernameSessionExpired()
{
	if (UKBVESupabaseSubsystem* Sub = SupabaseSubsystem.Get())
	{
		Sub->SignOut();
	}
	RefreshAuthVisibility(false);
}
```

- [ ] **Step 6: Rebuild the editor target**

```bash
pkill -9 -f UnrealEditor-Cmd 2>/dev/null; rm -f /tmp/UnrealEditor-Cmd* 2>/dev/null
```

Build `rentearthEditor`. Expected: compiles clean. Re-run `Automation RunTests Chuck.KbveApi` — 3 tests still PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/rentearth/unreal-rentearth/Source/chuck/UI/chuckMenuPlayerController.h \
        apps/rentearth/unreal-rentearth/Source/chuck/UI/chuckMenuPlayerController.cpp
git commit -m "feat(rentearth): three-state auth gate (login -> username -> play)"
```

---

### Task 5: Point the client at the live ARPG ingress

**Files:**
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.h`

**Interfaces:**
- Consumes: nothing.
- Produces: `ServerUrl` default `wss://arpg.kbve.com/ws`.

- [ ] **Step 1: Edit the default**

In `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.h`, change the `ServerUrl` default from `ws://localhost:7979/ws` to the live ingress:

```cpp
	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Simgrid")
	FString ServerUrl = TEXT("wss://arpg.kbve.com/ws");
```

- [ ] **Step 2: Rebuild the editor target**

```bash
pkill -9 -f UnrealEditor-Cmd 2>/dev/null; rm -f /tmp/UnrealEditor-Cmd* 2>/dev/null
```

Build `rentearthEditor`. Expected: compiles clean.

- [ ] **Step 3: Commit**

```bash
git add apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.h
git commit -m "feat(rentearth): point simgrid client at live arpg ingress"
```

---

## Manual Integration Verification (post-implementation)

Not a task (no automated coverage possible); run once after Task 5:

1. Launch `rentearthEditor`, PIE with a fresh Supabase account (no `kbve_username`).
2. Sign in → username-setup screen appears (not the play button).
3. Enter a username → Set → screen dismisses, play path appears.
4. Enter world → confirm the client connects to `wss://arpg.kbve.com/ws` and renders entities / receives ephemeral events (Phase 2/3 behavior).
5. Re-launch with the same account → username screen is skipped (goes straight to play).
