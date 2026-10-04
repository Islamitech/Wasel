export interface PresignedUploadResult {
  uploadUrl: string;
  fileKey: string;
  expiresInSeconds: number;
}

export interface StorageObjectMetadata {
  contentLength: number;
  contentType: string;
}

export interface IStorageService {
  getPresignedUploadUrl(bucket: string, fileKey: string, contentType: string, expiresInSeconds?: number): Promise<PresignedUploadResult>;
  getPresignedDownloadUrl(bucket: string, fileKey: string, expiresInSeconds?: number): Promise<string>;
  deleteFile(bucket: string, fileKey: string): Promise<boolean>;
  headObject(bucket: string, fileKey: string): Promise<StorageObjectMetadata | null>;
}

export const STORAGE_SERVICE_TOKEN = 'STORAGE_SERVICE_TOKEN';

