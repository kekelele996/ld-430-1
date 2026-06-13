import { Types } from 'mongoose';
import { UserRole, AssetType, AssetStatus, LicenseType } from './enums';

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

export interface AssetWithVersion {
  _id: Types.ObjectId;
  title: string;
  description: string;
  assetType: AssetType;
  fileFormat: string;
  fileUrl: string;
  thumbnailUrl?: string;
  fileSize: number;
  resolution?: { width: number; height: number };
  tags: string[];
  categoryId?: Types.ObjectId;
  uploaderId: string;
  licenseType: LicenseType;
  status: AssetStatus;
  downloadCount: number;
  viewCount: number;
  version: number;
  versions: AssetVersion[];
  createdAt: Date;
  updatedAt: Date;
}
