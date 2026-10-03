import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IStorageService, PresignedUploadResult } from './storage.interface.js';

@Injectable()
export class S3StorageService implements IStorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3: S3Client;

  constructor() {
    const endpoint = process.env.STORAGE_ENDPOINT || 'localhost';
    const port = process.env.STORAGE_PORT || '9000';
    const useSsl = process.env.STORAGE_USE_SSL === 'true';
    const protocol = useSsl ? 'https' : 'http';

    this.s3 = new S3Client({
      endpoint: `${protocol}://${endpoint}:${port}`,
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY || 'minio_admin',
        secretAccessKey: process.env.STORAGE_SECRET_KEY || 'minio_password',
      },
      forcePathStyle: true, // required for MinIO
    });
  }

  async getPresignedUploadUrl(
    bucket: string,
    fileKey: string,
    contentType: string,
    expiresInSeconds = 900,
  ): Promise<PresignedUploadResult> {
    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: fileKey,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
      return {
        uploadUrl,
        fileKey,
        expiresInSeconds,
      };
    } catch (err: any) {
      this.logger.error(`Error generating presigned upload URL for ${fileKey}: ${err.message}`);
      throw err;
    }
  }

  async getPresignedDownloadUrl(bucket: string, fileKey: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: fileKey,
    });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }

  async deleteFile(bucket: string, fileKey: string): Promise<boolean> {
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: fileKey }));
      return true;
    } catch (err: any) {
      this.logger.error(`Error deleting file ${fileKey}: ${err.message}`);
      return false;
    }
  }
}
