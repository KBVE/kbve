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
