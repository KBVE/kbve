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
	return false;
}
