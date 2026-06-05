#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "Settings/KBVEWebSurfaceSettings.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWebSurfaceAllowlistTest,
	"KBVE.WebSurface.Settings.Allowlist",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWebSurfaceAllowlistTest::RunTest(const FString& Parameters)
{
	UKBVEWebSurfaceSettings* Settings = NewObject<UKBVEWebSurfaceSettings>();
	Settings->AllowedURLPrefixes = { TEXT("https://kbve.com/"), TEXT("http://127.0.0.1:") };
	Settings->BlockedURLPrefixes = { TEXT("file://"), TEXT("chrome://") };

	TestTrue("kbve.com allowed", Settings->IsURLAllowed(TEXT("https://kbve.com/foo")));
	TestTrue("loopback allowed", Settings->IsURLAllowed(TEXT("http://127.0.0.1:3000/hud")));
	TestFalse("evil.com blocked (not in allowlist)", Settings->IsURLAllowed(TEXT("https://evil.com/")));
	TestFalse("file:// blocked by deny", Settings->IsURLAllowed(TEXT("file:///etc/passwd")));
	TestFalse("chrome:// blocked by deny", Settings->IsURLAllowed(TEXT("chrome://settings")));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWebSurfaceEmptyAllowlistTest,
	"KBVE.WebSurface.Settings.EmptyAllowlist",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWebSurfaceEmptyAllowlistTest::RunTest(const FString& Parameters)
{
	UKBVEWebSurfaceSettings* Settings = NewObject<UKBVEWebSurfaceSettings>();
	Settings->BlockedURLPrefixes = { TEXT("file://") };

	TestTrue("anything allowed when allowlist empty", Settings->IsURLAllowed(TEXT("https://example.com")));
	TestFalse("denylist still wins over empty allowlist", Settings->IsURLAllowed(TEXT("file:///x")));
	return true;
}

#endif
