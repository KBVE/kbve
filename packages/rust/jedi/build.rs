use std::fs;
use tonic_build;

fn main() {
  if std::env::var("BUILD_PROTO").is_err() {
    println!("cargo:warning=Skipping protobuf compilation (BUILD_PROTO not set)");
    return;
  }

  println!("[JEDI] Building the protobufs.");
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
    .type_attribute("redis.UnwatchCommand", "#[derive(serde::Serialize, serde::Deserialize)]")

    .type_attribute("redis.RedisKeyUpdate", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("redis.RedisKeyUpdate.state", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("redis.RedisWsMessage", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute(
      "redis.RedisWsMessage.message",
      "#[derive(serde::Serialize, serde::Deserialize)]"
    )
    .type_attribute("redis.Ping", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("redis.Pong", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("redis.ErrorMessage", "#[derive(serde::Serialize, serde::Deserialize)]")

    // Groq
    .type_attribute("groq.GroqMessage", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("groq.GroqMessageContent", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("groq.GroqChoice", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("groq.GroqUsage", "#[derive(serde::Serialize, serde::Deserialize)]")

    // Jedi
    .type_attribute("jedi.MessageKind", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("jedi.FlagEnvelope", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("jedi.FlexEnvelope", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("jedi.RawEnvelope", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("jedi.JediMessage", "#[derive(serde::Serialize, serde::Deserialize)]")
    .type_attribute("jedi.JediMessage.envelope", "#[derive(serde::Serialize, serde::Deserialize)]")
    // .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
    // .field_attribute("status.StatusMessage.type", "#[bitflags]")
    .compile_protos(&["proto/redis.proto", "proto/groq.proto", "proto/jedi.proto"], &["proto"])
    .expect("Failed to compile Protobuf files");
}
