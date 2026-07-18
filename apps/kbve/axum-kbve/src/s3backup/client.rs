use crate::s3backup::summary::S3Object;
use aws_sdk_s3::Client;

pub struct S3Config {
    pub bucket: String,
    pub prefix: String,
    pub region: String,
}

impl S3Config {
    pub fn from_env() -> Self {
        Self {
            bucket: std::env::var("KILOBASE_S3_BUCKET").unwrap_or_else(|_| "kilobase".into()),
            prefix: std::env::var("KILOBASE_S3_PREFIX").unwrap_or_else(|_| "barman/backup/".into()),
            region: std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".into()),
        }
    }
}

pub async fn make_client(cfg: &S3Config) -> Client {
    let region = aws_config::Region::new(cfg.region.clone());
    let conf = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(region)
        .load()
        .await;
    Client::new(&conf)
}

fn to_obj(o: &aws_sdk_s3::types::Object) -> S3Object {
    S3Object {
        key: o.key().unwrap_or_default().to_string(),
        size: o.size().unwrap_or(0),
        last_modified: o
            .last_modified()
            .and_then(|t| t.to_millis().ok())
            .map(|ms| ms / 1000)
            .unwrap_or(0),
    }
}

pub async fn list_page(
    client: &Client,
    bucket: &str,
    prefix: &str,
    token: Option<String>,
    limit: i32,
) -> Result<(Vec<S3Object>, Option<String>), String> {
    let mut req = client
        .list_objects_v2()
        .bucket(bucket)
        .prefix(prefix)
        .max_keys(limit);
    if let Some(t) = token {
        req = req.continuation_token(t);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let objs = resp.contents().iter().map(to_obj).collect();
    let next = resp.next_continuation_token().map(|s| s.to_string());
    Ok((objs, next))
}

pub async fn list_all(client: &Client, bucket: &str, prefix: &str) -> Result<Vec<S3Object>, String> {
    let mut out = Vec::new();
    let mut token = None;
    loop {
        let (mut page, next) = list_page(client, bucket, prefix, token, 1000).await?;
        out.append(&mut page);
        match next {
            Some(t) => token = Some(t),
            None => break,
        }
    }
    Ok(out)
}
