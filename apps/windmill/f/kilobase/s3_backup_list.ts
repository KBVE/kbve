import {
  S3Client,
  ListObjectsV2Command,
  type _Object,
} from "@aws-sdk/client-s3";
import { summarize, type S3Object } from "./s3_summary.ts";

type S3Resource = {
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
};

const DEFAULT_PREFIX = "barman/backup/";
const RETENTION_DAYS = 7;

async function listAllObjects(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<S3Object[]> {
  const objects: S3Object[] = [];
  let continuationToken: string | undefined;

  do {
    const resp = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const o of (resp.Contents ?? []) as _Object[]) {
      if (!o.Key) continue;
      objects.push({
        key: o.Key,
        size: o.Size ?? 0,
        lastModified: o.LastModified
          ? Math.floor(o.LastModified.getTime() / 1000)
          : 0,
      });
    }

    continuationToken = resp.IsTruncated
      ? resp.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return objects;
}

export async function main(s3: S3Resource, prefix: string = DEFAULT_PREFIX) {
  const client = new S3Client({
    region: s3.region,
    credentials: {
      accessKeyId: s3.accessKey,
      secretAccessKey: s3.secretKey,
    },
  });

  const objects = await listAllObjects(client, s3.bucket, prefix);
  const now = Math.floor(Date.now() / 1000);
  const summary = summarize(objects, now, RETENTION_DAYS);

  return { summary, objects };
}
