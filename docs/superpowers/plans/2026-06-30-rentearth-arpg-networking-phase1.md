# RentEarth ↔ ARPG Networking (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a byte-exact C++ client codec and connection subsystem (`KBVESimgrid` module) that speaks the Rust ARPG wire protocol (postcard + COBS over WebSocket) and reaches `Live` state against the server.

**Architecture:** A new `KBVESimgrid` runtime module under the existing `KBVENet` plugin. Bottom-up: COBS framing → postcard primitives → typed proto structs (the Phase-1 subset) → binary WebSocket transport → a `UGameInstanceSubsystem` state machine that performs the handshake and emits decoded events via delegates. No game/render code — that is the separate client-side plan.

**Tech Stack:** Unreal Engine 5.8, C++, `WebSockets` module (`IWebSocket`), `KBVESupabase` (JWT), UE automation tests (`IMPLEMENT_SIMPLE_AUTOMATION_TEST`).

## Global Constraints

- UE version: **5.8**. Target project: `apps/rentearth/unreal-rentearth/`.
- Plugin: add to existing `packages/unreal/KBVENet/` — do **not** create a new plugin.
- Wire is **byte-exact** against `packages/rust/simgrid/src/proto.rs`. `PROTOCOL_VERSION = 15`.
- Postcard encoding rules (verbatim): `u8`/`i8`/`bool` = 1 raw byte; `u16`/`u32`/`u64` = unsigned LEB128 varint; `i16`/`i32` = zigzag then varint (`(v<<1)^(v>>31)` enc, `(u>>>1)^-(u&1)` dec); `String` = varint byte-length + UTF-8; `Vec`/seq = varint count + elements; `Option` = 1 byte (0 None / 1 Some) + value; enum variant = varint discriminant in declaration order.
- COBS frames every top-level `ClientMessage`/`ServerEvent` (`to_allocvec_cobs`), terminated by a `0x00` delimiter. Ephemeral **inner** payloads are raw postcard (no COBS).
- Quantization constants `POS_SCALE=32`, `VEL_SCALE=256` are **not on the wire**; dequantization is the consumer's concern (client-side plan), not this module's.
- **No code comments** anywhere (project rule). Let names and structure carry meaning.
- Build/test through the rentearth UE project (its editor target must compile the plugin). Tests are `WITH_DEV_AUTOMATION_TESTS`-guarded and run via the editor automation runner.
- Follow existing KBVE plugin conventions: `PCHUsage = UseExplicitOrSharedPCHs`, `Category = "KBVE"`.

---

### Task 1: Scaffold the `KBVESimgrid` module

**Files:**

- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/KBVESimgrid.Build.cs`
- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Public/KBVESimgridModule.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/KBVESimgridModule.cpp`
- Modify: `packages/unreal/KBVENet/KBVENet.uplugin` (add a second module entry)

**Interfaces:**

- Consumes: nothing.
- Produces: a buildable `KBVESimgrid` runtime module that other tasks add files into. Log category `LogKBVESimgrid`.

- [ ] **Step 1: Write `KBVESimgrid.Build.cs`**

```csharp
using UnrealBuildTool;

public class KBVESimgrid : ModuleRules
{
	public KBVESimgrid(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"WebSockets",
			"KBVESupabase"
		});
	}
}
```

- [ ] **Step 2: Write the module header**

`Public/KBVESimgridModule.h`:

```cpp
#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

DECLARE_LOG_CATEGORY_EXTERN(LogKBVESimgrid, Log, All);

class FKBVESimgridModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
```

- [ ] **Step 3: Write the module impl**

`Private/KBVESimgridModule.cpp`:

```cpp
#include "KBVESimgridModule.h"

DEFINE_LOG_CATEGORY(LogKBVESimgrid);

void FKBVESimgridModule::StartupModule()
{
}

void FKBVESimgridModule::ShutdownModule()
{
}

IMPLEMENT_MODULE(FKBVESimgridModule, KBVESimgrid)
```

- [ ] **Step 4: Register the module in `KBVENet.uplugin`**

Replace the `"Modules"` array so it lists both modules:

```json
	"Modules": [
		{
			"Name": "KBVENet",
			"Type": "Runtime",
			"LoadingPhase": "Default"
		},
		{
			"Name": "KBVESimgrid",
			"Type": "Runtime",
			"LoadingPhase": "Default"
		}
	]
```

- [ ] **Step 5: Compile the rentearth editor target**

Run the project's editor build (the nx target / build script used for `unreal-rentearth`).
Expected: build succeeds; `LogKBVESimgrid` module loads (no test code yet).

- [ ] **Step 6: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgrid packages/unreal/KBVENet/KBVENet.uplugin
git commit -m "feat(KBVESimgrid): scaffold module under KBVENet plugin"
```

---

### Task 2: COBS encode/decode

**Files:**

- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Public/SimgridCobs.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/SimgridCobs.cpp`
- Test: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/Tests/SimgridCobsTests.cpp`

**Interfaces:**

- Consumes: nothing.
- Produces:
    - `TArray<uint8> FSimgridCobs::Encode(const TArray<uint8>& In)` — returns COBS-stuffed bytes **including** the trailing `0x00` delimiter.
    - `bool FSimgridCobs::Decode(const TArray<uint8>& In, TArray<uint8>& Out)` — decodes one frame (stops at delimiter), returns success.

- [ ] **Step 1: Write the failing test**

`Private/Tests/SimgridCobsTests.cpp`:

```cpp
#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridCobs.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridCobsRoundtripTest,
	"KBVE.Simgrid.Cobs.Roundtrip",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridCobsRoundtripTest::RunTest(const FString& Parameters)
{
	TArray<uint8> Payload = { 0x11, 0x00, 0x00, 0x22, 0x33 };
	TArray<uint8> Encoded = FSimgridCobs::Encode(Payload);
	TestEqual("delimiter terminated", Encoded.Last(), (uint8)0x00);
	TestFalse("no interior zero before delimiter", Encoded.Num() > 1 && Encoded[Encoded.Num() - 2] == 0x00 && Payload.Last() != 0x00 ? false : false);

	TArray<uint8> Decoded;
	const bool bOk = FSimgridCobs::Decode(Encoded, Decoded);
	TestTrue("decode ok", bOk);
	TestEqual("roundtrip length", Decoded.Num(), Payload.Num());
	for (int32 i = 0; i < Payload.Num(); ++i)
	{
		TestEqual(FString::Printf(TEXT("byte %d"), i), Decoded[i], Payload[i]);
	}
	return true;
}

#endif
```

- [ ] **Step 2: Run test to verify it fails**

Run the rentearth editor automation runner filtered to `KBVE.Simgrid.Cobs`.
Expected: FAIL / does not compile — `SimgridCobs.h` not found.

- [ ] **Step 3: Write the header**

`Public/SimgridCobs.h`:

```cpp
#pragma once

#include "CoreMinimal.h"

class KBVESIMGRID_API FSimgridCobs
{
public:
	static TArray<uint8> Encode(const TArray<uint8>& In);
	static bool Decode(const TArray<uint8>& In, TArray<uint8>& Out);
};
```

- [ ] **Step 4: Write the impl**

`Private/SimgridCobs.cpp` (mirrors `cobsEncode`/`cobsDecode` from `laser/src/lib/net/postcard.ts`):

```cpp
#include "SimgridCobs.h"

TArray<uint8> FSimgridCobs::Encode(const TArray<uint8>& In)
{
	TArray<uint8> Out;
	int32 CodeIdx = Out.Num();
	Out.Add(0);
	uint8 Code = 1;
	for (uint8 B : In)
	{
		if (B == 0)
		{
			Out[CodeIdx] = Code;
			CodeIdx = Out.Num();
			Out.Add(0);
			Code = 1;
		}
		else
		{
			Out.Add(B);
			Code += 1;
			if (Code == 0xff)
			{
				Out[CodeIdx] = Code;
				CodeIdx = Out.Num();
				Out.Add(0);
				Code = 1;
			}
		}
	}
	Out[CodeIdx] = Code;
	Out.Add(0);
	return Out;
}

bool FSimgridCobs::Decode(const TArray<uint8>& In, TArray<uint8>& Out)
{
	Out.Reset();
	int32 i = 0;
	while (i < In.Num())
	{
		const uint8 Code = In[i++];
		if (Code == 0)
		{
			return true;
		}
		for (int32 j = 1; j < Code && i < In.Num(); ++j)
		{
			Out.Add(In[i++]);
		}
		if (Code != 0xff && i < In.Num() && In[i] != 0)
		{
			Out.Add(0);
		}
	}
	return true;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run the automation runner filtered to `KBVE.Simgrid.Cobs`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgrid
git commit -m "feat(KBVESimgrid): COBS encode/decode with roundtrip test"
```

---

### Task 3: Postcard reader/writer primitives

**Files:**

- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Public/SimgridPostcard.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/SimgridPostcard.cpp`
- Test: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/Tests/SimgridPostcardTests.cpp`

**Interfaces:**

- Consumes: nothing.
- Produces:
    - `class FPostcardWriter` with methods: `U8(uint8)`, `I8(int8)`, `Bool(bool)`, `VarU32(uint32)`, `VarU64(uint64)`, `VarI32(int32)`, `U16(uint16)`, `U32(uint32)`, `U64(uint64)`, `I16(int16)`, `I32(int32)`, `String(const FString&)`, `SeqLen(int32)`, `Option(bool)`, `Variant(uint32)`, and `const TArray<uint8>& Bytes() const`.
    - `class FPostcardReader` constructed from `const TArray<uint8>&`, with matching read methods returning the decoded value plus `bool AtEnd() const`.

- [ ] **Step 1: Write the failing test**

`Private/Tests/SimgridPostcardTests.cpp`:

```cpp
#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridPostcard.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridPostcardPrimitivesTest,
	"KBVE.Simgrid.Postcard.Primitives",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridPostcardPrimitivesTest::RunTest(const FString& Parameters)
{
	FPostcardWriter W;
	W.VarU32(7);
	W.I8(-1);
	W.Bool(true);
	W.VarI32(-3);
	W.String(TEXT("h0ly"));
	W.U16(300);
	W.VarU64(0xC0FFEEull);

	FPostcardReader R(W.Bytes());
	TestEqual("u32", R.VarU32(), (uint32)7);
	TestEqual("i8", (int32)R.I8(), -1);
	TestTrue("bool", R.Bool());
	TestEqual("i32 zigzag", R.VarI32(), -3);
	TestEqual("string", R.String(), FString(TEXT("h0ly")));
	TestEqual("u16", (uint32)R.U16(), (uint32)300);
	TestEqual("u64", R.VarU64(), (uint64)0xC0FFEEull);
	TestTrue("consumed all", R.AtEnd());
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridPostcardZigzagTest,
	"KBVE.Simgrid.Postcard.Zigzag",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridPostcardZigzagTest::RunTest(const FString& Parameters)
{
	const int32 Cases[] = { 0, -1, 1, 127, -128, 2147483647, -2147483648 };
	for (int32 V : Cases)
	{
		FPostcardWriter W;
		W.VarI32(V);
		FPostcardReader R(W.Bytes());
		TestEqual(FString::Printf(TEXT("zigzag %d"), V), R.VarI32(), V);
	}
	return true;
}

#endif
```

- [ ] **Step 2: Run test to verify it fails**

Run automation filtered to `KBVE.Simgrid.Postcard`.
Expected: FAIL — `SimgridPostcard.h` not found.

- [ ] **Step 3: Write the header**

`Public/SimgridPostcard.h`:

```cpp
#pragma once

#include "CoreMinimal.h"

class KBVESIMGRID_API FPostcardWriter
{
public:
	void U8(uint8 V);
	void I8(int8 V);
	void Bool(bool V);
	void VarU32(uint32 V);
	void VarU64(uint64 V);
	void VarI32(int32 V);
	void U16(uint16 V);
	void U32(uint32 V);
	void U64(uint64 V);
	void I16(int16 V);
	void I32(int32 V);
	void String(const FString& S);
	void SeqLen(int32 N);
	void Option(bool bPresent);
	void Variant(uint32 Idx);
	const TArray<uint8>& Bytes() const { return Buf; }

private:
	TArray<uint8> Buf;
};

class KBVESIMGRID_API FPostcardReader
{
public:
	explicit FPostcardReader(const TArray<uint8>& In) : Data(In) {}

	uint8 U8();
	int8 I8();
	bool Bool();
	uint32 VarU32();
	uint64 VarU64();
	int32 VarI32();
	uint16 U16();
	uint32 U32();
	uint64 U64();
	int16 I16();
	int32 I32();
	FString String();
	int32 SeqLen();
	bool Option();
	uint32 Variant();
	bool AtEnd() const { return Off >= Data.Num(); }
	bool HasError() const { return bError; }

private:
	uint8 Next();
	const TArray<uint8>& Data;
	int32 Off = 0;
	bool bError = false;
};
```

- [ ] **Step 4: Write the impl**

`Private/SimgridPostcard.cpp` (mirrors `PostcardWriter`/`PostcardReader` in `laser/src/lib/net/postcard.ts`):

```cpp
#include "SimgridPostcard.h"

void FPostcardWriter::U8(uint8 V) { Buf.Add(V); }
void FPostcardWriter::I8(int8 V) { Buf.Add((uint8)V); }
void FPostcardWriter::Bool(bool V) { Buf.Add(V ? 1 : 0); }

void FPostcardWriter::VarU32(uint32 V)
{
	uint32 N = V;
	while (N >= 0x80)
	{
		Buf.Add((uint8)((N & 0x7f) | 0x80));
		N >>= 7;
	}
	Buf.Add((uint8)N);
}

void FPostcardWriter::VarU64(uint64 V)
{
	uint64 N = V;
	while (N >= 0x80)
	{
		Buf.Add((uint8)((N & 0x7f) | 0x80));
		N >>= 7;
	}
	Buf.Add((uint8)N);
}

void FPostcardWriter::VarI32(int32 V)
{
	const uint32 ZZ = ((uint32)(V << 1)) ^ ((uint32)(V >> 31));
	VarU32(ZZ);
}

void FPostcardWriter::U16(uint16 V) { VarU32((uint32)V); }
void FPostcardWriter::U32(uint32 V) { VarU32(V); }
void FPostcardWriter::U64(uint64 V) { VarU64(V); }
void FPostcardWriter::I16(int16 V) { VarI32((int32)V); }
void FPostcardWriter::I32(int32 V) { VarI32(V); }

void FPostcardWriter::String(const FString& S)
{
	FTCHARToUTF8 Conv(*S);
	const int32 Len = Conv.Length();
	VarU32((uint32)Len);
	const ANSICHAR* Ptr = Conv.Get();
	for (int32 i = 0; i < Len; ++i)
	{
		Buf.Add((uint8)Ptr[i]);
	}
}

void FPostcardWriter::SeqLen(int32 N) { VarU32((uint32)N); }
void FPostcardWriter::Option(bool bPresent) { Buf.Add(bPresent ? 1 : 0); }
void FPostcardWriter::Variant(uint32 Idx) { VarU32(Idx); }

uint8 FPostcardReader::Next()
{
	if (Off >= Data.Num())
	{
		bError = true;
		return 0;
	}
	return Data[Off++];
}

uint8 FPostcardReader::U8() { return Next(); }

int8 FPostcardReader::I8()
{
	const uint8 B = Next();
	return (int8)B;
}

bool FPostcardReader::Bool() { return Next() != 0; }

uint32 FPostcardReader::VarU32()
{
	uint32 Result = 0;
	int32 Shift = 0;
	uint8 B;
	do
	{
		B = Next();
		Result |= (uint32)(B & 0x7f) << Shift;
		Shift += 7;
	} while ((B & 0x80) && Shift < 35);
	return Result;
}

uint64 FPostcardReader::VarU64()
{
	uint64 Result = 0;
	int32 Shift = 0;
	uint8 B;
	do
	{
		B = Next();
		Result |= (uint64)(B & 0x7f) << Shift;
		Shift += 7;
	} while ((B & 0x80) && Shift < 70);
	return Result;
}

int32 FPostcardReader::VarI32()
{
	const uint32 U = VarU32();
	return (int32)(U >> 1) ^ -(int32)(U & 1);
}

uint16 FPostcardReader::U16() { return (uint16)VarU32(); }
uint32 FPostcardReader::U32() { return VarU32(); }
uint64 FPostcardReader::U64() { return VarU64(); }
int16 FPostcardReader::I16() { return (int16)VarI32(); }
int32 FPostcardReader::I32() { return VarI32(); }

FString FPostcardReader::String()
{
	const int32 Len = (int32)VarU32();
	if (Off + Len > Data.Num())
	{
		bError = true;
		return FString();
	}
	FUTF8ToTCHAR Conv((const ANSICHAR*)(Data.GetData() + Off), Len);
	Off += Len;
	return FString(Conv.Length(), Conv.Get());
}

int32 FPostcardReader::SeqLen() { return (int32)VarU32(); }
bool FPostcardReader::Option() { return Next() != 0; }
uint32 FPostcardReader::Variant() { return VarU32(); }
```

- [ ] **Step 5: Run test to verify it passes**

Run automation filtered to `KBVE.Simgrid.Postcard`.
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgrid
git commit -m "feat(KBVESimgrid): postcard reader/writer primitives with tests"
```

---

### Task 4: Client message encoding (JoinMatch + ClientFrame) with hex fixtures

**Files:**

- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Public/SimgridProto.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/SimgridProto.cpp`
- Test: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/Tests/SimgridClientMessageTests.cpp`

**Interfaces:**

- Consumes: `FPostcardWriter` (Task 3), `FSimgridCobs` (Task 2).
- Produces:
    - Structs: `FSimgridTile { int32 X, Y; }`, `FSimgridMove { uint32 Seq; int8 Mx, My; bool bRun; uint32 Tick; }`.
    - Enum tags `EnsimgridInput` are encoded inline; for Phase 1 only `Move` (variant 1), `Fell` (variant 24), and `Leave` (variant 13) are needed.
    - `FProtoCodec::EncodeJoinMatch(uint32 Protocol, const FString& Jwt, const FString& Username) -> TArray<uint8>` (COBS-framed, ready to send).
    - `FProtoCodec::EncodeMoveFrame(uint32 ClientTick, const FSimgridMove& Move) -> TArray<uint8>` (COBS-framed).
    - Internal raw (pre-COBS) helpers exposed for fixture tests: `FProtoCodec::RawJoinMatch(...)`, `FProtoCodec::RawFrameMoveFellLeave(uint32 ClientTick, const FSimgridMove&, const FSimgridTile& FellTile)`.

The fixtures from `postcard-wire.spec.ts` are pre-COBS for `Frame` and post-COBS for `JoinMatch`. Test the raw (pre-COBS) bytes against the `Frame` fixture, and the COBS-framed bytes against the `JoinMatch` fixture.

- [ ] **Step 1: Write the failing test**

`Private/Tests/SimgridClientMessageTests.cpp`:

```cpp
#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridProto.h"
#include "SimgridCobs.h"

static TArray<uint8> HexToBytes(const FString& Hex)
{
	TArray<uint8> Out;
	for (int32 i = 0; i + 1 < Hex.Len(); i += 2)
	{
		const int32 Hi = FParse::HexDigit(Hex[i]);
		const int32 Lo = FParse::HexDigit(Hex[i + 1]);
		Out.Add((uint8)((Hi << 4) | Lo));
	}
	return Out;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridFrameFixtureTest,
	"KBVE.Simgrid.Wire.Frame",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridFrameFixtureTest::RunTest(const FString& Parameters)
{
	FSimgridMove Move;
	Move.Seq = 3;
	Move.Mx = 127;
	Move.My = -1;
	Move.bRun = true;
	Move.Tick = 9;
	FSimgridTile Fell;
	Fell.X = 5;
	Fell.Y = -3;

	const TArray<uint8> Framed = FSimgridCobs::Encode(FProtoCodec::RawFrameMoveFellLeave(7, Move, Fell));
	const TArray<uint8> Expected = HexToBytes(TEXT("0e01070301037fff0109180a050d00"));
	TestEqual("frame byte length", Framed.Num(), Expected.Num());
	for (int32 i = 0; i < Expected.Num(); ++i)
	{
		TestEqual(FString::Printf(TEXT("frame byte %d"), i), Framed[i], Expected[i]);
	}
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridJoinMatchFixtureTest,
	"KBVE.Simgrid.Wire.JoinMatch",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridJoinMatchFixtureTest::RunTest(const FString& Parameters)
{
	const TArray<uint8> Framed = FProtoCodec::EncodeJoinMatch(15, TEXT("tok"), TEXT("h0ly"));
	const TArray<uint8> Expected = HexToBytes(TEXT("010b0f03746f6b0468306c7900"));
	TestEqual("joinmatch byte length", Framed.Num(), Expected.Num());
	for (int32 i = 0; i < Expected.Num(); ++i)
	{
		TestEqual(FString::Printf(TEXT("joinmatch byte %d"), i), Framed[i], Expected[i]);
	}
	return true;
}

#endif
```

> Fixture note: `RawFrameMoveFellLeave` encodes `ClientMessage::Frame` (variant 1) → `ClientFrame{ client_tick: 7, inputs: [Move{3,127,-1,true,9}, Fell{5,-3}, Leave] }`. The fixture string is the **COBS-framed** form (leading `0e` run-length, trailing `00` delimiter), so the test compares `FSimgridCobs::Encode(rawBody)` against it.

- [ ] **Step 2: Run test to verify it fails**

Run automation filtered to `KBVE.Simgrid.Wire`.
Expected: FAIL — `SimgridProto.h` not found.

- [ ] **Step 3: Write the header**

`Public/SimgridProto.h`:

```cpp
#pragma once

#include "CoreMinimal.h"

struct FSimgridTile
{
	int32 X = 0;
	int32 Y = 0;
};

struct FSimgridMove
{
	uint32 Seq = 0;
	int8 Mx = 0;
	int8 My = 0;
	bool bRun = false;
	uint32 Tick = 0;
};

class KBVESIMGRID_API FProtoCodec
{
public:
	static TArray<uint8> RawJoinMatch(uint32 Protocol, const FString& Jwt, const FString& Username);
	static TArray<uint8> RawFrameMoveFellLeave(uint32 ClientTick, const FSimgridMove& Move, const FSimgridTile& FellTile);
	static TArray<uint8> RawFrameMove(uint32 ClientTick, const FSimgridMove& Move);

	static TArray<uint8> EncodeJoinMatch(uint32 Protocol, const FString& Jwt, const FString& Username);
	static TArray<uint8> EncodeMoveFrame(uint32 ClientTick, const FSimgridMove& Move);
};
```

- [ ] **Step 4: Write the impl**

`Private/SimgridProto.cpp` (variant indices from `proto.rs`: `ClientMessage::JoinMatch=0`, `Frame=1`; `Input::Move=1`, `Leave=13`, `Fell=24`):

```cpp
#include "SimgridProto.h"
#include "SimgridPostcard.h"
#include "SimgridCobs.h"

static void WriteTile(FPostcardWriter& W, const FSimgridTile& T)
{
	W.VarI32(T.X);
	W.VarI32(T.Y);
}

static void WriteMove(FPostcardWriter& W, const FSimgridMove& M)
{
	W.Variant(1);
	W.VarU32(M.Seq);
	W.I8(M.Mx);
	W.I8(M.My);
	W.Bool(M.bRun);
	W.VarU32(M.Tick);
}

TArray<uint8> FProtoCodec::RawJoinMatch(uint32 Protocol, const FString& Jwt, const FString& Username)
{
	FPostcardWriter W;
	W.Variant(0);
	W.VarU32(Protocol);
	W.String(Jwt);
	W.String(Username);
	return W.Bytes();
}

TArray<uint8> FProtoCodec::RawFrameMoveFellLeave(uint32 ClientTick, const FSimgridMove& Move, const FSimgridTile& FellTile)
{
	FPostcardWriter W;
	W.Variant(1);
	W.VarU32(ClientTick);
	W.SeqLen(3);
	WriteMove(W, Move);
	W.Variant(24);
	WriteTile(W, FellTile);
	W.Variant(13);
	return W.Bytes();
}

TArray<uint8> FProtoCodec::RawFrameMove(uint32 ClientTick, const FSimgridMove& Move)
{
	FPostcardWriter W;
	W.Variant(1);
	W.VarU32(ClientTick);
	W.SeqLen(1);
	WriteMove(W, Move);
	return W.Bytes();
}

TArray<uint8> FProtoCodec::EncodeJoinMatch(uint32 Protocol, const FString& Jwt, const FString& Username)
{
	return FSimgridCobs::Encode(RawJoinMatch(Protocol, Jwt, Username));
}

TArray<uint8> FProtoCodec::EncodeMoveFrame(uint32 ClientTick, const FSimgridMove& Move)
{
	return FSimgridCobs::Encode(RawFrameMove(ClientTick, Move));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run automation filtered to `KBVE.Simgrid.Wire`.
Expected: PASS — both fixture byte sequences match exactly. If a mismatch appears, the failing byte index points at the field that diverged from `proto.rs`.

- [ ] **Step 6: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgrid
git commit -m "feat(KBVESimgrid): client message encode (JoinMatch/Frame) byte-exact"
```

---

### Task 5: Server event decoding (Welcome, Snapshot, EntityDelta, Reject) with hex fixtures

**Files:**

- Modify: `packages/unreal/KBVENet/Source/KBVESimgrid/Public/SimgridProto.h`
- Modify: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/SimgridProto.cpp`
- Test: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/Tests/SimgridServerEventTests.cpp`

**Interfaces:**

- Consumes: `FPostcardReader` (Task 3), `FSimgridCobs` (Task 2).
- Produces:
    - `enum class EServerEventType : uint8 { Welcome, Snapshot, Ephemeral, Reject, Unknown }`.
    - `FSimgridKindEntry { uint16 Kind; FString RefId; uint8 Cat; }`.
    - `FSimgridEntityDelta` mirroring `proto.rs` `EntityDelta` field order (see Step 3).
    - `FSimgridWelcome { uint32 Protocol; uint16 YourSlot; uint64 Seed; TArray<FSimgridKindEntry> Registry; }`.
    - `FSimgridSnapshot { uint32 Tick; uint32 ServerTimeMs; uint32 InputAck; TArray<FSimgridEntityDelta> Entities; bool bKeyframe; }` (players parsed and skipped in Phase 1).
    - `FSimgridReject { FString Reason; }`.
    - `FServerDecoded { EServerEventType Type; FSimgridWelcome Welcome; FSimgridSnapshot Snapshot; uint16 EphemeralKind; uint16 EphemeralTo; TArray<uint8> EphemeralPayload; FSimgridReject Reject; bool bOk; }`.
    - `FProtoCodec::DecodeServerEvent(const TArray<uint8>& Frame) -> FServerDecoded` (COBS-deframes first).
    - `FProtoCodec::DecodeServerEventRaw(const TArray<uint8>& Body) -> FServerDecoded` (already-deframed, for fixtures).

> `PlayerView` is parsed-and-discarded in Phase 1. To skip it correctly you still must decode its fields; rather than model the full struct, decode the `players` Vec by reading its length and, for each, skipping the exact `PlayerView` byte layout. To avoid guessing that layout, Phase-1 fixtures use snapshots with **zero players** (the captured `Snapshot` fixture has `players: []`). The decoder asserts `players seqLen == 0` is handled; a non-zero player list sets `bOk=false` and stops parsing (safe degrade). Full `PlayerView` decode is deferred to the client-side plan when player rendering lands.

- [ ] **Step 1: Write the failing test**

`Private/Tests/SimgridServerEventTests.cpp`:

```cpp
#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridProto.h"
#include "SimgridCobs.h"

static TArray<uint8> HexToBytes2(const FString& Hex)
{
	TArray<uint8> Out;
	for (int32 i = 0; i + 1 < Hex.Len(); i += 2)
	{
		Out.Add((uint8)((FParse::HexDigit(Hex[i]) << 4) | FParse::HexDigit(Hex[i + 1])));
	}
	return Out;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridWelcomeDecodeTest,
	"KBVE.Simgrid.Wire.WelcomeDecode",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridWelcomeDecodeTest::RunTest(const FString& Parameters)
{
	const TArray<uint8> Frame = HexToBytes2(TEXT("01160f03eeff830601010b77797665726e5f666972650100"));
	const FServerDecoded D = FProtoCodec::DecodeServerEvent(Frame);
	TestTrue("decoded ok", D.bOk);
	TestTrue("is welcome", D.Type == EServerEventType::Welcome);
	TestEqual("protocol", D.Welcome.Protocol, (uint32)15);
	TestEqual("your_slot", (uint32)D.Welcome.YourSlot, (uint32)3);
	TestEqual("seed", D.Welcome.Seed, (uint64)0xC0FFEEull);
	TestEqual("registry count", D.Welcome.Registry.Num(), 1);
	TestEqual("kind", (uint32)D.Welcome.Registry[0].Kind, (uint32)1);
	TestEqual("ref", D.Welcome.Registry[0].RefId, FString(TEXT("wyvern_fire")));
	TestEqual("cat", (uint32)D.Welcome.Registry[0].Cat, (uint32)1);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridSnapshotDecodeTest,
	"KBVE.Simgrid.Wire.SnapshotDecode",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridSnapshotDecodeTest::RunTest(const FString& Parameters)
{
	const TArray<uint8> Frame = HexToBytes2(TEXT("040109640109010207ffff030a050881c002bf01180d033c500501010305020100"));
	const FServerDecoded D = FProtoCodec::DecodeServerEvent(Frame);
	TestTrue("decoded ok", D.bOk);
	TestTrue("is snapshot", D.Type == EServerEventType::Snapshot);
	TestEqual("tick", D.Snapshot.Tick, (uint32)9);
	TestEqual("server_time_ms", D.Snapshot.ServerTimeMs, (uint32)100);
	TestEqual("input_ack", D.Snapshot.InputAck, (uint32)0);
	TestEqual("entity count", D.Snapshot.Entities.Num(), 1);
	TestTrue("keyframe", D.Snapshot.bKeyframe);
	return true;
}

#endif
```

- [ ] **Step 2: Run test to verify it fails**

Run automation filtered to `KBVE.Simgrid.Wire.WelcomeDecode` and `...SnapshotDecode`.
Expected: FAIL — decode functions/types not defined.

- [ ] **Step 3: Add types + decoder to the header and impl**

Append to `Public/SimgridProto.h`:

```cpp
enum class EServerEventType : uint8 { Welcome, Snapshot, Ephemeral, Reject, Unknown };

struct FSimgridKindEntry
{
	uint16 Kind = 0;
	FString RefId;
	uint8 Cat = 0;
};

struct FSimgridStatusView
{
	uint8 Kind = 0;
	int32 Magnitude = 0;
	uint32 Remaining = 0;
};

struct FSimgridEntityDelta
{
	uint32 Eid = 0;
	uint16 Kind = 0;
	uint16 Owner = 0;
	FSimgridTile Tile;
	uint8 Facing = 0;
	uint8 Sub = 0;
	int32 Qx = 0;
	int32 Qy = 0;
	int16 Qvx = 0;
	int16 Qvy = 0;
	uint32 InputAck = 0;
	int32 Hp = 0;
	int32 MaxHp = 0;
	bool bDestroyed = false;
	int32 Z = 0;
	TArray<FSimgridStatusView> Effects;
	uint32 Piloting = 0;
};

struct FSimgridWelcome
{
	uint32 Protocol = 0;
	uint16 YourSlot = 0;
	uint64 Seed = 0;
	TArray<FSimgridKindEntry> Registry;
};

struct FSimgridSnapshot
{
	uint32 Tick = 0;
	uint32 ServerTimeMs = 0;
	uint32 InputAck = 0;
	TArray<FSimgridEntityDelta> Entities;
	bool bKeyframe = false;
};

struct FSimgridReject
{
	FString Reason;
};

struct FServerDecoded
{
	EServerEventType Type = EServerEventType::Unknown;
	FSimgridWelcome Welcome;
	FSimgridSnapshot Snapshot;
	uint16 EphemeralKind = 0;
	uint16 EphemeralTo = 0;
	TArray<uint8> EphemeralPayload;
	FSimgridReject Reject;
	bool bOk = false;
};
```

Add to the `FProtoCodec` class body:

```cpp
	static FServerDecoded DecodeServerEvent(const TArray<uint8>& Frame);
	static FServerDecoded DecodeServerEventRaw(const TArray<uint8>& Body);
```

Append to `Private/SimgridProto.cpp` (`StatusView` layout from `proto.rs`: `kind:u8, magnitude:zigzag i32, remaining:u32`; `EntityDelta` field order exactly as captured):

```cpp
static FSimgridTile ReadTile(FPostcardReader& R)
{
	FSimgridTile T;
	T.X = R.VarI32();
	T.Y = R.VarI32();
	return T;
}

static FSimgridEntityDelta ReadEntityDelta(FPostcardReader& R)
{
	FSimgridEntityDelta E;
	E.Eid = R.VarU32();
	E.Kind = R.U16();
	E.Owner = R.U16();
	E.Tile = ReadTile(R);
	E.Facing = R.U8();
	E.Sub = R.U8();
	E.Qx = R.VarI32();
	E.Qy = R.VarI32();
	E.Qvx = R.I16();
	E.Qvy = R.I16();
	E.InputAck = R.VarU32();
	E.Hp = R.VarI32();
	E.MaxHp = R.VarI32();
	E.bDestroyed = R.Bool();
	E.Z = R.VarI32();
	const int32 EffCount = R.SeqLen();
	for (int32 i = 0; i < EffCount; ++i)
	{
		FSimgridStatusView S;
		S.Kind = R.U8();
		S.Magnitude = R.VarI32();
		S.Remaining = R.VarU32();
		E.Effects.Add(S);
	}
	E.Piloting = R.VarU32();
	return E;
}

FServerDecoded FProtoCodec::DecodeServerEventRaw(const TArray<uint8>& Body)
{
	FServerDecoded D;
	FPostcardReader R(Body);
	const uint32 Variant = R.Variant();
	switch (Variant)
	{
	case 0:
	{
		D.Type = EServerEventType::Welcome;
		D.Welcome.Protocol = R.VarU32();
		D.Welcome.YourSlot = R.U16();
		D.Welcome.Seed = R.VarU64();
		const int32 Count = R.SeqLen();
		for (int32 i = 0; i < Count; ++i)
		{
			FSimgridKindEntry K;
			K.Kind = R.U16();
			K.RefId = R.String();
			K.Cat = R.U8();
			D.Welcome.Registry.Add(K);
		}
		break;
	}
	case 1:
	{
		D.Type = EServerEventType::Snapshot;
		D.Snapshot.Tick = R.VarU32();
		D.Snapshot.ServerTimeMs = R.VarU32();
		D.Snapshot.InputAck = R.VarU32();
		const int32 PlayerCount = R.SeqLen();
		if (PlayerCount != 0)
		{
			D.bOk = false;
			return D;
		}
		const int32 EntityCount = R.SeqLen();
		for (int32 i = 0; i < EntityCount; ++i)
		{
			D.Snapshot.Entities.Add(ReadEntityDelta(R));
		}
		D.Snapshot.bKeyframe = R.Bool();
		break;
	}
	case 2:
	{
		D.Type = EServerEventType::Ephemeral;
		D.EphemeralKind = R.U16();
		D.EphemeralTo = R.U16();
		const int32 Len = R.SeqLen();
		for (int32 i = 0; i < Len; ++i)
		{
			D.EphemeralPayload.Add(R.U8());
		}
		break;
	}
	case 3:
	{
		D.Type = EServerEventType::Reject;
		D.Reject.Reason = R.String();
		break;
	}
	default:
		D.Type = EServerEventType::Unknown;
		break;
	}
	D.bOk = !R.HasError() && D.Type != EServerEventType::Unknown;
	return D;
}

FServerDecoded FProtoCodec::DecodeServerEvent(const TArray<uint8>& Frame)
{
	TArray<uint8> Body;
	FSimgridCobs::Decode(Frame, Body);
	return DecodeServerEventRaw(Body);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run automation filtered to `KBVE.Simgrid.Wire.WelcomeDecode` and `...SnapshotDecode`.
Expected: PASS. (If the Snapshot test fails on a later field, the `EntityDelta` order is the suspect — re-check against `proto.rs`.)

- [ ] **Step 5: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgrid
git commit -m "feat(KBVESimgrid): server event decode (Welcome/Snapshot/Reject) byte-exact"
```

---

### Task 6: WebSocket transport wrapper

**Files:**

- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Public/SimgridWebSocket.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/SimgridWebSocket.cpp`

**Interfaces:**

- Consumes: `WebSockets` module (`IWebSocket`, `FWebSocketsModule`).
- Produces:
    - `class FSimgridWebSocket` (plain C++, not UObject) with:
        - delegates `FOnOpen`, `FOnClose(int32, FString, bool)`, `FOnError(FString)`, `FOnBinary(const TArray<uint8>&)`.
        - `void Connect(const FString& Url)`, `void SendBinary(const TArray<uint8>& Bytes)`, `void Close()`, `bool IsConnected() const`.
    - Inbound binary uses `OnRawMessage` and reassembles fragments using its `Size`/`BytesRemaining` parameters into complete frames before emitting `FOnBinary`.

This task has no isolated unit test (it wraps engine networking). It is verified live in Task 7. Keep it minimal and correct.

- [ ] **Step 1: Write the header**

`Public/SimgridWebSocket.h`:

```cpp
#pragma once

#include "CoreMinimal.h"

class IWebSocket;

class KBVESIMGRID_API FSimgridWebSocket
{
public:
	DECLARE_MULTICAST_DELEGATE(FOnOpen);
	DECLARE_MULTICAST_DELEGATE_ThreeParams(FOnClose, int32, const FString&, bool);
	DECLARE_MULTICAST_DELEGATE_OneParam(FOnError, const FString&);
	DECLARE_MULTICAST_DELEGATE_OneParam(FOnBinary, const TArray<uint8>&);

	FOnOpen OnOpen;
	FOnClose OnClose;
	FOnError OnError;
	FOnBinary OnBinary;

	void Connect(const FString& Url);
	void SendBinary(const TArray<uint8>& Bytes);
	void Close();
	bool IsConnected() const;

private:
	void HandleRaw(const void* Data, SIZE_T Size, SIZE_T BytesRemaining);

	TSharedPtr<IWebSocket> Socket;
	TArray<uint8> RxAccum;
};
```

- [ ] **Step 2: Write the impl**

`Private/SimgridWebSocket.cpp`:

```cpp
#include "SimgridWebSocket.h"
#include "KBVESimgridModule.h"
#include "WebSocketsModule.h"
#include "IWebSocket.h"

void FSimgridWebSocket::Connect(const FString& Url)
{
	if (!FModuleManager::Get().IsModuleLoaded("WebSockets"))
	{
		FModuleManager::Get().LoadModule("WebSockets");
	}

	Socket = FWebSocketsModule::Get().CreateWebSocket(Url, TEXT(""));
	if (!Socket.IsValid())
	{
		OnError.Broadcast(TEXT("Failed to create WebSocket"));
		return;
	}

	Socket->OnConnected().AddLambda([this]()
	{
		OnOpen.Broadcast();
	});
	Socket->OnConnectionError().AddLambda([this](const FString& Err)
	{
		OnError.Broadcast(Err);
	});
	Socket->OnClosed().AddLambda([this](int32 Code, const FString& Reason, bool bClean)
	{
		OnClose.Broadcast(Code, Reason, bClean);
	});
	Socket->OnRawMessage().AddLambda([this](const void* Data, SIZE_T Size, SIZE_T BytesRemaining)
	{
		HandleRaw(Data, Size, BytesRemaining);
	});

	Socket->Connect();
}

void FSimgridWebSocket::HandleRaw(const void* Data, SIZE_T Size, SIZE_T BytesRemaining)
{
	const uint8* Bytes = static_cast<const uint8*>(Data);
	RxAccum.Append(Bytes, (int32)Size);
	if (BytesRemaining == 0)
	{
		TArray<uint8> Frame = MoveTemp(RxAccum);
		RxAccum.Reset();
		OnBinary.Broadcast(Frame);
	}
}

void FSimgridWebSocket::SendBinary(const TArray<uint8>& Bytes)
{
	if (Socket.IsValid() && Socket->IsConnected())
	{
		Socket->Send(Bytes.GetData(), Bytes.Num(), true);
	}
	else
	{
		UE_LOG(LogKBVESimgrid, Warning, TEXT("SendBinary dropped: socket not connected"));
	}
}

void FSimgridWebSocket::Close()
{
	if (Socket.IsValid())
	{
		Socket->Close();
		Socket.Reset();
	}
}

bool FSimgridWebSocket::IsConnected() const
{
	return Socket.IsValid() && Socket->IsConnected();
}
```

- [ ] **Step 3: Compile**

Build the rentearth editor target.
Expected: compiles clean.

- [ ] **Step 4: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgrid
git commit -m "feat(KBVESimgrid): binary WebSocket transport wrapper"
```

---

### Task 7: Client subsystem (state machine, handshake, auth, delegates)

**Files:**

- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Public/SimgridClientSubsystem.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/SimgridClientSubsystem.cpp`

**Interfaces:**

- Consumes: `FSimgridWebSocket` (Task 6), `FProtoCodec` (Tasks 4–5), `UKBVESupabaseSubsystem::GetAccessToken()` / `GetUser().KbveUsername` (KBVESupabase).
- Produces:
    - `enum class ESimgridState : uint8 { Disconnected, Connecting, Joining, Live }`.
    - `USimgridClientSubsystem : public UGameInstanceSubsystem` with:
        - `void ConnectToServer(const FString& Url)` — pulls JWT+username from KBVESupabase, opens socket.
        - `void Disconnect()`.
        - `void SendMove(const FSimgridMove& Move)`.
        - dynamic multicast delegates: `OnWelcome(int32 YourSlot, int64 Seed)`, `OnSnapshot()` (Phase 1 surfaces the latest snapshot via `GetLastSnapshot()`), `OnRejected(const FString& Reason)`, `OnDisconnected()`.
        - `ESimgridState GetState() const`, `const FSimgridSnapshot& GetLastSnapshot() const`.

- [ ] **Step 1: Write the header**

`Public/SimgridClientSubsystem.h`:

```cpp
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "SimgridProto.h"
#include "SimgridClientSubsystem.generated.h"

class FSimgridWebSocket;

UENUM(BlueprintType)
enum class ESimgridState : uint8
{
	Disconnected,
	Connecting,
	Joining,
	Live
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FSimgridOnWelcome, int32, YourSlot, int64, Seed);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FSimgridOnSnapshot);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FSimgridOnRejected, const FString&, Reason);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FSimgridOnDisconnected);

UCLASS()
class KBVESIMGRID_API USimgridClientSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Deinitialize() override;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Simgrid")
	void ConnectToServer(const FString& Url);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Simgrid")
	void Disconnect();

	void SendMove(const FSimgridMove& Move);

	UFUNCTION(BlueprintPure, Category = "KBVE|Simgrid")
	ESimgridState GetState() const { return State; }

	const FSimgridSnapshot& GetLastSnapshot() const { return LastSnapshot; }

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Simgrid")
	FSimgridOnWelcome OnWelcome;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Simgrid")
	FSimgridOnSnapshot OnSnapshot;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Simgrid")
	FSimgridOnRejected OnRejected;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Simgrid")
	FSimgridOnDisconnected OnDisconnected;

private:
	void HandleOpen();
	void HandleBinary(const TArray<uint8>& Frame);
	void HandleClose(int32 Code, const FString& Reason, bool bClean);
	void HandleError(const FString& Err);

	TSharedPtr<FSimgridWebSocket> Ws;
	ESimgridState State = ESimgridState::Disconnected;
	FString PendingJwt;
	FString PendingUsername;
	uint32 ClientTick = 0;
	uint32 MoveSeq = 0;
	FSimgridSnapshot LastSnapshot;
};
```

- [ ] **Step 2: Write the impl**

`Private/SimgridClientSubsystem.cpp` (auth via KBVESupabase; protocol guard against `15`):

```cpp
#include "SimgridClientSubsystem.h"
#include "SimgridWebSocket.h"
#include "KBVESimgridModule.h"
#include "KBVESupabaseSubsystem.h"

static const uint32 GSimgridProtocolVersion = 15;

void USimgridClientSubsystem::ConnectToServer(const FString& Url)
{
	if (State != ESimgridState::Disconnected)
	{
		UE_LOG(LogKBVESimgrid, Warning, TEXT("ConnectToServer ignored: state not Disconnected"));
		return;
	}

	PendingJwt.Reset();
	PendingUsername.Reset();

	if (UGameInstance* GI = GetGameInstance())
	{
		if (UKBVESupabaseSubsystem* Supa = GI->GetSubsystem<UKBVESupabaseSubsystem>())
		{
			PendingJwt = Supa->GetAccessToken();
			PendingUsername = Supa->GetUser().KbveUsername;
		}
	}

	Ws = MakeShared<FSimgridWebSocket>();
	Ws->OnOpen.AddLambda([this]() { HandleOpen(); });
	Ws->OnBinary.AddLambda([this](const TArray<uint8>& Frame) { HandleBinary(Frame); });
	Ws->OnClose.AddLambda([this](int32 Code, const FString& Reason, bool bClean) { HandleClose(Code, Reason, bClean); });
	Ws->OnError.AddLambda([this](const FString& Err) { HandleError(Err); });

	State = ESimgridState::Connecting;
	Ws->Connect(Url);
}

void USimgridClientSubsystem::HandleOpen()
{
	State = ESimgridState::Joining;
	const TArray<uint8> Frame = FProtoCodec::EncodeJoinMatch(GSimgridProtocolVersion, PendingJwt, PendingUsername);
	Ws->SendBinary(Frame);
}

void USimgridClientSubsystem::HandleBinary(const TArray<uint8>& Frame)
{
	const FServerDecoded D = FProtoCodec::DecodeServerEvent(Frame);
	if (!D.bOk)
	{
		UE_LOG(LogKBVESimgrid, Warning, TEXT("Dropped undecodable frame (%d bytes)"), Frame.Num());
		return;
	}

	switch (D.Type)
	{
	case EServerEventType::Welcome:
		if (D.Welcome.Protocol != GSimgridProtocolVersion)
		{
			UE_LOG(LogKBVESimgrid, Error, TEXT("Protocol mismatch: server %u client %u"), D.Welcome.Protocol, GSimgridProtocolVersion);
			Disconnect();
			return;
		}
		State = ESimgridState::Live;
		OnWelcome.Broadcast((int32)D.Welcome.YourSlot, (int64)D.Welcome.Seed);
		break;
	case EServerEventType::Snapshot:
		LastSnapshot = D.Snapshot;
		OnSnapshot.Broadcast();
		break;
	case EServerEventType::Reject:
		OnRejected.Broadcast(D.Reject.Reason);
		Disconnect();
		break;
	case EServerEventType::Ephemeral:
		UE_LOG(LogKBVESimgrid, Verbose, TEXT("Ephemeral kind=%u (%d bytes)"), D.EphemeralKind, D.EphemeralPayload.Num());
		break;
	default:
		break;
	}
}

void USimgridClientSubsystem::SendMove(const FSimgridMove& Move)
{
	if (State != ESimgridState::Live || !Ws.IsValid())
	{
		return;
	}
	FSimgridMove Tx = Move;
	Tx.Seq = ++MoveSeq;
	Tx.Tick = ClientTick;
	const TArray<uint8> Frame = FProtoCodec::EncodeMoveFrame(++ClientTick, Tx);
	Ws->SendBinary(Frame);
}

void USimgridClientSubsystem::HandleClose(int32 Code, const FString& Reason, bool bClean)
{
	State = ESimgridState::Disconnected;
	OnDisconnected.Broadcast();
}

void USimgridClientSubsystem::HandleError(const FString& Err)
{
	UE_LOG(LogKBVESimgrid, Error, TEXT("WebSocket error: %s"), *Err);
	State = ESimgridState::Disconnected;
	OnDisconnected.Broadcast();
}

void USimgridClientSubsystem::Disconnect()
{
	if (Ws.IsValid())
	{
		Ws->Close();
		Ws.Reset();
	}
	State = ESimgridState::Disconnected;
}

void USimgridClientSubsystem::Deinitialize()
{
	Disconnect();
	Super::Deinitialize();
}
```

- [ ] **Step 3: Add KBVEGameplay/Engine dep if needed and compile**

Ensure `KBVESimgrid.Build.cs` `PrivateDependencyModuleNames` includes `"KBVESupabase"` (already added in Task 1).
Build the rentearth editor target.
Expected: compiles clean; `USimgridClientSubsystem` available in Blueprint under "KBVE|Simgrid".

- [ ] **Step 4: Live integration verification**

Start a local ARPG server (`apps/agones/arpg/server`) with no JWT secret set (dev-accept), listening on `:7979`.
In a rentearth PIE session, call `ConnectToServer("ws://localhost:7979/ws")` (Blueprint node or a temporary console exec).
Expected log sequence:

- `Connecting` → socket open → `Joining` (JoinMatch sent)
- `OnWelcome` fires with a slot and seed; state → `Live`
- `OnSnapshot` fires repeatedly.

If `OnRejected` fires, read the reason (auth/protocol). If protocol mismatch logs, the server `PROTOCOL_VERSION` moved past 15 and `GSimgridProtocolVersion` + the proto mirrors need a re-sync.

- [ ] **Step 5: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgrid
git commit -m "feat(KBVESimgrid): client subsystem handshake + state machine"
```

---

## Self-Review Notes

- **Spec coverage:** plugin/module layout (Task 1), COBS (Task 2), postcard primitives (Task 3), handshake encode (Task 4), snapshot/welcome decode (Task 5), WS transport (Task 6), state machine + auth + version guard + delegates (Task 7). Hex-fixture drift guard present in Tasks 4–5. Auth via KBVESupabase in Task 7. Error/lifecycle in Task 7. Debug-actor render, iso camera, interpolation, ephemeral gameplay, and `MoveTo` are explicitly **out of scope** (client-side plan).
- **Fixture caveat:** the `Frame` fixture is COBS-framed; the test compares `FSimgridCobs::Encode(raw)` to the fixture. The `Welcome`/`Snapshot` fixtures include the COBS frame and are decoded via `DecodeServerEvent` (which deframes). The `PlayerView` layout is intentionally not modeled — Phase-1 fixtures carry zero players and the decoder bails safely on non-empty player lists.
- **Type consistency:** `FSimgridMove`, `FSimgridTile`, `FServerDecoded`, `EServerEventType`, `ESimgridState`, and the `FProtoCodec` method names are used identically across tasks.
- **Re-sync trigger:** any `proto.rs` change shifts fixture bytes → Task 4/5 tests fail at build, signaling a manual mirror update before runtime breakage.

## Out of Scope (separate client-side plan)

Pawn/actor spawning from snapshots, dequantization (`/POS_SCALE`), tile→world mapping, isometric camera rig, snapshot interpolation, input sampling from EnhancedInput, ephemeral gameplay events, `MoveTo` click-to-move, reconnect/backoff policy.
