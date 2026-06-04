#include "KBVEULID.h"

#include "Misc/DateTime.h"
#include "Misc/Guid.h"

IMPLEMENT_MODULE(FKBVEULIDModule, KBVEULID)

namespace
{
	static constexpr TCHAR Alphabet[] = TEXT("0123456789ABCDEFGHJKMNPQRSTVWXYZ");

	uint64 UnixMillisecondsNow()
	{
		const FDateTime Epoch(1970, 1, 1);
		const FTimespan SinceEpoch = FDateTime::UtcNow() - Epoch;
		return (uint64)SinceEpoch.GetTotalMilliseconds();
	}

	void FillRandom80(uint8* Out10)
	{
		const FGuid G = FGuid::NewGuid();
		FMemory::Memcpy(Out10 + 0, &G.A, 4);
		FMemory::Memcpy(Out10 + 4, &G.B, 4);
		const uint16 Low16 = (uint16)(G.C & 0xFFFFu);
		Out10[8] = (uint8)(Low16 & 0xFFu);
		Out10[9] = (uint8)((Low16 >> 8) & 0xFFu);
	}
}

FKBVEUlid::FKBVEUlid()
{
	FMemory::Memzero(Bytes, sizeof(Bytes));
}

FKBVEUlid FKBVEUlid::New()
{
	FKBVEUlid Id;
	const uint64 Ms = UnixMillisecondsNow();

	Id.Bytes[0] = (uint8)((Ms >> 40) & 0xFF);
	Id.Bytes[1] = (uint8)((Ms >> 32) & 0xFF);
	Id.Bytes[2] = (uint8)((Ms >> 24) & 0xFF);
	Id.Bytes[3] = (uint8)((Ms >> 16) & 0xFF);
	Id.Bytes[4] = (uint8)((Ms >> 8)  & 0xFF);
	Id.Bytes[5] = (uint8)( Ms        & 0xFF);

	FillRandom80(Id.Bytes + 6);
	return Id;
}

FString FKBVEUlid::ToString() const
{
	const uint8* D = Bytes;
	TCHAR Buf[27];
	Buf[26] = 0;

	Buf[0]  = Alphabet[(D[0] & 0xE0) >> 5];
	Buf[1]  = Alphabet[ D[0] & 0x1F];
	Buf[2]  = Alphabet[(D[1] & 0xF8) >> 3];
	Buf[3]  = Alphabet[((D[1] & 0x07) << 2) | ((D[2] & 0xC0) >> 6)];
	Buf[4]  = Alphabet[(D[2] & 0x3E) >> 1];
	Buf[5]  = Alphabet[((D[2] & 0x01) << 4) | ((D[3] & 0xF0) >> 4)];
	Buf[6]  = Alphabet[((D[3] & 0x0F) << 1) | ((D[4] & 0x80) >> 7)];
	Buf[7]  = Alphabet[(D[4] & 0x7C) >> 2];
	Buf[8]  = Alphabet[((D[4] & 0x03) << 3) | ((D[5] & 0xE0) >> 5)];
	Buf[9]  = Alphabet[ D[5] & 0x1F];

	Buf[10] = Alphabet[(D[6] & 0xF8) >> 3];
	Buf[11] = Alphabet[((D[6] & 0x07) << 2) | ((D[7] & 0xC0) >> 6)];
	Buf[12] = Alphabet[(D[7] & 0x3E) >> 1];
	Buf[13] = Alphabet[((D[7] & 0x01) << 4) | ((D[8] & 0xF0) >> 4)];
	Buf[14] = Alphabet[((D[8] & 0x0F) << 1) | ((D[9] & 0x80) >> 7)];
	Buf[15] = Alphabet[(D[9] & 0x7C) >> 2];
	Buf[16] = Alphabet[((D[9] & 0x03) << 3) | ((D[10] & 0xE0) >> 5)];
	Buf[17] = Alphabet[ D[10] & 0x1F];

	Buf[18] = Alphabet[(D[11] & 0xF8) >> 3];
	Buf[19] = Alphabet[((D[11] & 0x07) << 2) | ((D[12] & 0xC0) >> 6)];
	Buf[20] = Alphabet[(D[12] & 0x3E) >> 1];
	Buf[21] = Alphabet[((D[12] & 0x01) << 4) | ((D[13] & 0xF0) >> 4)];
	Buf[22] = Alphabet[((D[13] & 0x0F) << 1) | ((D[14] & 0x80) >> 7)];
	Buf[23] = Alphabet[(D[14] & 0x7C) >> 2];
	Buf[24] = Alphabet[((D[14] & 0x03) << 3) | ((D[15] & 0xE0) >> 5)];
	Buf[25] = Alphabet[ D[15] & 0x1F];

	return FString(Buf);
}

namespace KBVEULID
{
	FString Generate()
	{
		return FKBVEUlid::New().ToString();
	}
}
