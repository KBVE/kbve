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
