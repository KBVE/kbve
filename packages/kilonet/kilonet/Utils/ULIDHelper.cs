using System;
using System.Security.Cryptography;
using System.Text;
using Cysharp.Threading.Tasks;

namespace KBVE.Kilonet.Utils
{
  public static class ULIDHelper
  {
    private const string CrockfordBase32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    public static string GenerateULID()
    {
      byte[] timestampBytes = GetTimestampBytes();
      byte[] randomBytes = GetRandomBytes();
      byte[] ulidBytes = CombineBytes(timestampBytes, randomBytes);

      return EncodeBase32(ulidBytes);
    }

    public static UniTask<string> GenerateULIDAsync()
    {
      return UniTask.Run(() =>
      {
        byte[] timestampBytes = GetTimestampBytes();
        byte[] randomBytes = GetRandomBytes();
        byte[] ulidBytes = CombineBytes(timestampBytes, randomBytes);

        return EncodeBase32(ulidBytes);
      });
    }

    private static byte[] GetTimestampBytes()
    {
      long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
      byte[] bytes = new byte[6];

      for (int i = 5; i >= 0; i--)
      {
        bytes[i] = (byte)(timestamp & 0xFF);
        timestamp >>= 8;
      }

      return bytes;
    }

    private static byte[] GetRandomBytes()
    {
      byte[] bytes = new byte[10];
      using (var rng = RandomNumberGenerator.Create())
      {
        rng.GetBytes(bytes);
      }
      return bytes;
    }

    private static byte[] CombineBytes(byte[] timestampBytes, byte[] randomBytes)
    {
      byte[] combined = new byte[16];
      Array.Copy(timestampBytes, 0, combined, 0, timestampBytes.Length);
      Array.Copy(randomBytes, 0, combined, timestampBytes.Length, randomBytes.Length);
      return combined;
    }

    private static string EncodeBase32(byte[] data)
    {
      StringBuilder result = new StringBuilder(26);
      ulong value = 0;
      int bits = 0;

      for (int i = 0; i < data.Length; i++)
      {
        value = (value << 8) | data[i];
        bits += 8;

        while (bits >= 5)
        {
          result.Append(CrockfordBase32[(int)((value >> (bits - 5)) & 0x1F)]);
          bits -= 5;
        }
      }

      if (bits > 0)
      {
        result.Append(CrockfordBase32[(int)((value << (5 - bits)) & 0x1F)]);
      }

      return result.ToString();
    }
  }
}
