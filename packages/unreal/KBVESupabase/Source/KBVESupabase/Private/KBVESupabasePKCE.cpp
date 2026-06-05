#include "KBVESupabasePKCE.h"
#include "Misc/Guid.h"
#include "Misc/Base64.h"

namespace
{
	// FIPS 180-4 SHA-256, public-domain reference. Single-shot only —
	// not exposed as an incremental hasher because we never need one.
	struct FSha256Ctx
	{
		uint32 State[8];
		uint8  Buffer[64];
		uint64 BitLen;
		uint32 BufLen;
	};

	static const uint32 SHA256_K[64] = {
		0x428a2f98u,0x71374491u,0xb5c0fbcfu,0xe9b5dba5u,0x3956c25bu,0x59f111f1u,0x923f82a4u,0xab1c5ed5u,
		0xd807aa98u,0x12835b01u,0x243185beu,0x550c7dc3u,0x72be5d74u,0x80deb1feu,0x9bdc06a7u,0xc19bf174u,
		0xe49b69c1u,0xefbe4786u,0x0fc19dc6u,0x240ca1ccu,0x2de92c6fu,0x4a7484aau,0x5cb0a9dcu,0x76f988dau,
		0x983e5152u,0xa831c66du,0xb00327c8u,0xbf597fc7u,0xc6e00bf3u,0xd5a79147u,0x06ca6351u,0x14292967u,
		0x27b70a85u,0x2e1b2138u,0x4d2c6dfcu,0x53380d13u,0x650a7354u,0x766a0abbu,0x81c2c92eu,0x92722c85u,
		0xa2bfe8a1u,0xa81a664bu,0xc24b8b70u,0xc76c51a3u,0xd192e819u,0xd6990624u,0xf40e3585u,0x106aa070u,
		0x19a4c116u,0x1e376c08u,0x2748774cu,0x34b0bcb5u,0x391c0cb3u,0x4ed8aa4au,0x5b9cca4fu,0x682e6ff3u,
		0x748f82eeu,0x78a5636fu,0x84c87814u,0x8cc70208u,0x90befffau,0xa4506cebu,0xbef9a3f7u,0xc67178f2u
	};

	static inline uint32 Rotr32(uint32 X, uint32 N) { return (X >> N) | (X << (32 - N)); }

	static void Sha256Transform(FSha256Ctx& C, const uint8* Block)
	{
		uint32 W[64];
		for (int i = 0, j = 0; i < 16; ++i, j += 4)
		{
			W[i] = (uint32(Block[j]) << 24) | (uint32(Block[j+1]) << 16) | (uint32(Block[j+2]) << 8) | uint32(Block[j+3]);
		}
		for (int i = 16; i < 64; ++i)
		{
			const uint32 S0 = Rotr32(W[i-15], 7) ^ Rotr32(W[i-15], 18) ^ (W[i-15] >> 3);
			const uint32 S1 = Rotr32(W[i-2], 17) ^ Rotr32(W[i-2], 19) ^ (W[i-2] >> 10);
			W[i] = W[i-16] + S0 + W[i-7] + S1;
		}

		uint32 A = C.State[0], B = C.State[1], D = C.State[2], E = C.State[3];
		uint32 F = C.State[4], G = C.State[5], H = C.State[6], I = C.State[7];

		for (int i = 0; i < 64; ++i)
		{
			const uint32 S1 = Rotr32(F, 6) ^ Rotr32(F, 11) ^ Rotr32(F, 25);
			const uint32 Ch = (F & G) ^ (~F & H);
			const uint32 T1 = I + S1 + Ch + SHA256_K[i] + W[i];
			const uint32 S0 = Rotr32(A, 2) ^ Rotr32(A, 13) ^ Rotr32(A, 22);
			const uint32 Mj = (A & B) ^ (A & D) ^ (B & D);
			const uint32 T2 = S0 + Mj;
			I = H; H = G; G = F; F = E + T1;
			E = D; D = B; B = A; A = T1 + T2;
		}

		C.State[0] += A; C.State[1] += B; C.State[2] += D; C.State[3] += E;
		C.State[4] += F; C.State[5] += G; C.State[6] += H; C.State[7] += I;
	}

	static void Sha256Init(FSha256Ctx& C)
	{
		C.State[0] = 0x6a09e667u; C.State[1] = 0xbb67ae85u;
		C.State[2] = 0x3c6ef372u; C.State[3] = 0xa54ff53au;
		C.State[4] = 0x510e527fu; C.State[5] = 0x9b05688cu;
		C.State[6] = 0x1f83d9abu; C.State[7] = 0x5be0cd19u;
		C.BitLen = 0;
		C.BufLen = 0;
	}

	static void Sha256Update(FSha256Ctx& C, const uint8* Data, uint64 Len)
	{
		for (uint64 i = 0; i < Len; ++i)
		{
			C.Buffer[C.BufLen++] = Data[i];
			if (C.BufLen == 64)
			{
				Sha256Transform(C, C.Buffer);
				C.BitLen += 512;
				C.BufLen = 0;
			}
		}
	}

	static void Sha256Final(FSha256Ctx& C, uint8 Out[32])
	{
		uint32 i = C.BufLen;
		C.Buffer[i++] = 0x80;
		if (i > 56)
		{
			while (i < 64) C.Buffer[i++] = 0;
			Sha256Transform(C, C.Buffer);
			i = 0;
		}
		while (i < 56) C.Buffer[i++] = 0;
		C.BitLen += C.BufLen * 8;
		C.Buffer[63] = static_cast<uint8>(C.BitLen);
		C.Buffer[62] = static_cast<uint8>(C.BitLen >> 8);
		C.Buffer[61] = static_cast<uint8>(C.BitLen >> 16);
		C.Buffer[60] = static_cast<uint8>(C.BitLen >> 24);
		C.Buffer[59] = static_cast<uint8>(C.BitLen >> 32);
		C.Buffer[58] = static_cast<uint8>(C.BitLen >> 40);
		C.Buffer[57] = static_cast<uint8>(C.BitLen >> 48);
		C.Buffer[56] = static_cast<uint8>(C.BitLen >> 56);
		Sha256Transform(C, C.Buffer);

		for (int j = 0; j < 8; ++j)
		{
			Out[j * 4 + 0] = static_cast<uint8>(C.State[j] >> 24);
			Out[j * 4 + 1] = static_cast<uint8>(C.State[j] >> 16);
			Out[j * 4 + 2] = static_cast<uint8>(C.State[j] >> 8);
			Out[j * 4 + 3] = static_cast<uint8>(C.State[j]);
		}
	}

	static const TCHAR Base64Alphabet[] = TEXT("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");

	FString Base64Encode(TArrayView<const uint8> Bytes)
	{
		FString Out;
		const int32 In = Bytes.Num();
		Out.Reserve(((In + 2) / 3) * 4);
		int32 i = 0;
		for (; i + 3 <= In; i += 3)
		{
			const uint32 V = (uint32(Bytes[i]) << 16) | (uint32(Bytes[i+1]) << 8) | uint32(Bytes[i+2]);
			Out.AppendChar(Base64Alphabet[(V >> 18) & 0x3f]);
			Out.AppendChar(Base64Alphabet[(V >> 12) & 0x3f]);
			Out.AppendChar(Base64Alphabet[(V >> 6) & 0x3f]);
			Out.AppendChar(Base64Alphabet[V & 0x3f]);
		}
		if (i < In)
		{
			const int32 Remain = In - i;
			uint32 V = uint32(Bytes[i]) << 16;
			if (Remain == 2) V |= uint32(Bytes[i+1]) << 8;
			Out.AppendChar(Base64Alphabet[(V >> 18) & 0x3f]);
			Out.AppendChar(Base64Alphabet[(V >> 12) & 0x3f]);
			Out.AppendChar(Remain == 2 ? Base64Alphabet[(V >> 6) & 0x3f] : TEXT('='));
			Out.AppendChar(TEXT('='));
		}
		return Out;
	}

	void FillRandomBytes(TArray<uint8>& Out, int32 Num)
	{
		Out.SetNumUninitialized(Num);
		int32 Filled = 0;
		while (Filled < Num)
		{
			const FGuid Guid = FGuid::NewGuid();
			const uint32 Parts[4] = { Guid.A, Guid.B, Guid.C, Guid.D };
			const int32 Take = FMath::Min(static_cast<int32>(sizeof(Parts)), Num - Filled);
			FMemory::Memcpy(Out.GetData() + Filled, Parts, Take);
			Filled += Take;
		}
	}
}

namespace KBVESupabaseCrypto
{
	FString Base64URLEncode(TArrayView<const uint8> Bytes)
	{
		FString Out = Base64Encode(Bytes);
		Out.ReplaceInline(TEXT("+"), TEXT("-"));
		Out.ReplaceInline(TEXT("/"), TEXT("_"));
		Out.ReplaceInline(TEXT("="), TEXT(""));
		return Out;
	}

	bool Base64URLDecode(const FString& Encoded, TArray<uint8>& OutBytes)
	{
		FString Padded = Encoded;
		Padded.ReplaceInline(TEXT("-"), TEXT("+"));
		Padded.ReplaceInline(TEXT("_"), TEXT("/"));
		const int32 Mod = Padded.Len() % 4;
		if (Mod > 0)
		{
			for (int32 i = 0; i < 4 - Mod; ++i)
			{
				Padded.AppendChar(TEXT('='));
			}
		}
		return FBase64::Decode(Padded, OutBytes);
	}

	void Sha256(TArrayView<const uint8> Bytes, uint8 OutDigest[32])
	{
		FSha256Ctx Ctx;
		Sha256Init(Ctx);
		Sha256Update(Ctx, Bytes.GetData(), static_cast<uint64>(Bytes.Num()));
		Sha256Final(Ctx, OutDigest);
	}

	FString Sha256Base64URL(const FString& Input)
	{
		const FTCHARToUTF8 Utf8(*Input);
		uint8 Digest[32];
		Sha256(TArrayView<const uint8>(reinterpret_cast<const uint8*>(Utf8.Get()), Utf8.Length()), Digest);
		return Base64URLEncode(TArrayView<const uint8>(Digest, 32));
	}
}

FKBVESupabasePKCE FKBVESupabasePKCE::Generate()
{
	TArray<uint8> VerifierBytes;
	FillRandomBytes(VerifierBytes, 32);

	TArray<uint8> StateBytes;
	FillRandomBytes(StateBytes, 16);

	FKBVESupabasePKCE Out;
	Out.Verifier = KBVESupabaseCrypto::Base64URLEncode(VerifierBytes);
	Out.Challenge = KBVESupabaseCrypto::Sha256Base64URL(Out.Verifier);
	Out.State = KBVESupabaseCrypto::Base64URLEncode(StateBytes);
	return Out;
}
