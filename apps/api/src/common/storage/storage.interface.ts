export interface PresignedUploadResult {
  uploadUrl: string;
  fileKey: string;
  expiresInSeconds: number;
}

export interface IStorageService {
  getPresignedUploadUrl(bucket: string, fileKey: string, contentType: string, expiresInSeconds?: number): Promise<PresignedUploadResult>;
  getPresignedDownloadUrl(bucket: string, fileKey: string, expiresInSeconds?: number): Promise<string>;
  deleteFile(bucket: string, fileKey: string): Promise<boolean>;
}

export const STORAGE_SERVICE_TOKEN = 'STORAGE_SERVICE_TOKEN';
