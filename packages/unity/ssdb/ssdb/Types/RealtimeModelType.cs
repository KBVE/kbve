using System;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;
using Newtonsoft.Json;

namespace KBVE.SSDB.SupabaseFDW
{
    [Table("realtime_messages")]
    public class RealtimeMessage : BaseModel
    {
        [PrimaryKey("id", false)]
        public long Id { get; set; }

        [Column("topic")]
        public string Topic { get; set; }

        [Column("user_id")]
        public Guid? UserId { get; set; }

        [Column("payload")]
        public string PayloadJson { get; set; }

        [JsonIgnore]
        public dynamic Payload 
        { 
            get 
            { 
                return string.IsNullOrEmpty(PayloadJson) 
                    ? null 
                    : JsonConvert.DeserializeObject(PayloadJson);
            }
            set 
            { 
                PayloadJson = value == null 
                    ? null 
                    : JsonConvert.SerializeObject(value);
            }
        }

        [Column("message_type")]
        public string MessageType { get; set; } = "broadcast";

        [Column("created_at")]
        public DateTime? CreatedAt { get; set; }

        [Column("updated_at")]
        public DateTime? UpdatedAt { get; set; }
    }
}