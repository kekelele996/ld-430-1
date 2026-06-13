import { UserRole } from './enums';

export interface AuthUser {
  id: string;
  role: UserRole;
  canDownloadCommercial?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface AssetVersion {
  version: number;
  fileUrl: string;
  thumbnailUrl?: string;
  fileSize: number;
  fileFormat: string;
  resolution?: { width: number; height: number };
  uploadedAt: Date;
  uploaderId: string;
}
