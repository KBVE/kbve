using Unity.Collections;
using Unity.Networking.Transport;

namespace KBVE.Kilonet.Utils
{
  public static class BytesUtils
  {
    /// <summary>
    /// Reads all bytes from a DataStreamReader and returns them as a byte array.
    /// </summary>
    public static byte[] ReadAllBytes(DataStreamReader reader)
    {

    var buffer = new byte[reader.Length];
    reader.ReadBytes(buffer);
    return buffer;
    }

    /// <summary>
    /// Reads all bytes from a DataStreamReader into a NativeArray using bulk operations for better performance.
    /// </summary>
    public static NativeArray<byte> ReadAllBytesToNativeArray(
      DataStreamReader reader,
      Allocator allocator
    )
    {
      var buffer = new NativeArray<byte>(reader.Length, allocator);
      reader.ReadBytes(buffer.GetSubArray(0, reader.Length));
      return buffer;
    }
  }
}
