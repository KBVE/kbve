use std::fs;
use tonic_build;

fn main() {
  let out_dir = "src/proto";

  fs::create_dir_all(out_dir).unwrap();

  tonic_build
    ::configure()
    .build_client(true)
    .build_server(true)
    .out_dir(out_dir)
    // Redis
    .type_attribute("redis.RedisCommand", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("redis.RedisCommand.command", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("redis.SetCommand", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("redis.GetCommand", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("redis.DelCommand", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("redis.RedisResponse", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("redis.RedisEvent", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("redis.RedisEventObject", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute(
      "redis.RedisEventObject.object",
      "#[derive(serde::Serialize, serde::Deserialize)]"
    )
    .type_attribute("redis.WatchCommand", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("redis.RedisKeyUpdate", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("redis.RedisKeyUpdate.state", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("redis.RedisWsMessage", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("redis.RedisWsMessage.message", "#[derive(serde::Serialize, serde::Deserialize)]")

    // Groq
    .type_attribute("groq.GroqMessage", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("groq.GroqMessageContent", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("groq.GroqChoice", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("groq.GroqUsage", "#[derive(serde::Serialize, serde::Deserialize)]")
    // .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
    // .field_attribute("status.StatusMessage.type", "#[bitflags]")
    .compile_protos(&["proto/redis.proto", "proto/groq.proto"], &["proto"])
    .expect("Failed to compile Protobuf files");
}
