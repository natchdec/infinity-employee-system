import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { invariant } from '../domain/core';
import { config } from './config';

let client: S3Client | undefined;

function safeKey(key: string): string {
  invariant(
    /^[A-Za-z0-9][A-Za-z0-9._/-]{1,500}$/.test(key) && !key.includes('..'),
    'INVALID_STORAGE_KEY',
    'รหัสจัดเก็บเอกสารไม่ถูกต้อง',
    500,
  );
  return key;
}

function localPath(key: string): string {
  const root = path.resolve(config().STORAGE_ROOT);
  const target = path.resolve(root, safeKey(key));
  invariant(
    target === root || target.startsWith(root + path.sep),
    'INVALID_STORAGE_KEY',
    'รหัสจัดเก็บเอกสารไม่ถูกต้อง',
    500,
  );
  return target;
}

function s3Client(): S3Client {
  const c = config();
  invariant(c.STORAGE_REGION, 'STORAGE_NOT_CONFIGURED', 'ยังไม่ได้ตั้งค่า Object Storage', 503);
  client ??= new S3Client({ region: c.STORAGE_REGION });
  return client;
}

export async function putObject(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const c = config();
  safeKey(key);
  if (c.STORAGE_DRIVER === 'filesystem') {
    const target = localPath(key);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    try {
      await writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
    }
    return;
  }
  invariant(c.STORAGE_BUCKET, 'STORAGE_NOT_CONFIGURED', 'ยังไม่ได้ตั้งค่า Object Storage', 503);
  await s3Client().send(
    new PutObjectCommand({
      Bucket: c.STORAGE_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
    }),
  );
}

export async function getObject(key: string): Promise<Buffer> {
  const c = config();
  safeKey(key);
  if (c.STORAGE_DRIVER === 'filesystem') return readFile(localPath(key));
  invariant(c.STORAGE_BUCKET, 'STORAGE_NOT_CONFIGURED', 'ยังไม่ได้ตั้งค่า Object Storage', 503);
  const output = await s3Client().send(
    new GetObjectCommand({
      Bucket: c.STORAGE_BUCKET,
      Key: key,
    }),
  );
  invariant(output.Body, 'DOCUMENT_MISSING', 'ไม่พบไฟล์เอกสาร', 404);
  return Buffer.from(await output.Body.transformToByteArray());
}
