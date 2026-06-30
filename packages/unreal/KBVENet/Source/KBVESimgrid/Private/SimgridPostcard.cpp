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
