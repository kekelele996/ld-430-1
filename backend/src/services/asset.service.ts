import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Asset, AssetVersionInfo, type AssetDocument } from '../models/asset.schema';
import { AssetStatus } from '../types/enums';
import type { AssetVersion, AssetWithVersion } from '../types/interfaces';
import { validateFileFormat } from '../utils/fileValidator';
import { thumbnailFromUrl } from '../utils/thumbnailGenerator';
import { TagService } from './tag.service';
import { StorageService } from './storage.service';

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('http');
}

@Injectable()
export class AssetService {
  constructor(
    @InjectModel(Asset.name) private readonly assetModel: Model<AssetDocument>,
    private readonly tagService: TagService,
    private readonly storageService: StorageService,
  ) {}

  async findAll(query: { keyword?: string; tag?: string; status?: AssetStatus }): Promise<AssetWithVersion[]> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.tag) filter.tags = query.tag;
    if (query.keyword) filter.$text = { $search: query.keyword };
    const assets = await this.assetModel.find(filter).sort({ createdAt: -1 }).exec();
    return assets.map((a) => this.toAssetWithVersion(a));
  }

  async findOne(id: string): Promise<AssetWithVersion> {
    const asset = await this.assetModel.findByIdAndUpdate(id, { $inc: { viewCount: 1 } }, { new: true }).exec();
    if (!asset) throw new NotFoundException('素材不存在');
    return this.toAssetWithVersion(asset);
  }

  async findOneByVersion(id: string, version: number): Promise<AssetWithVersion> {
    const asset = await this.assetModel.findById(id).exec();
    if (!asset) throw new NotFoundException('素材不存在');

    await this.assetModel.findByIdAndUpdate(id, { $inc: { viewCount: 1 } }, { new: true }).exec();

    if (version === asset.version) {
      return this.toAssetWithVersion(asset);
    }

    const targetVersion = asset.versions.find((v) => v.version === version);
    if (!targetVersion) throw new NotFoundException('版本不存在');

    const base = this.toAssetWithVersion(asset);
    return {
      ...base,
      version: targetVersion.version,
      fileUrl: targetVersion.fileUrl,
      thumbnailUrl: targetVersion.thumbnailUrl,
      fileSize: targetVersion.fileSize,
      fileFormat: targetVersion.fileFormat,
      resolution: targetVersion.resolution,
      updatedAt: targetVersion.uploadedAt,
    };
  }

  async findVersions(id: string): Promise<AssetVersion[]> {
    const asset = await this.assetModel.findById(id).exec();
    if (!asset) throw new NotFoundException('素材不存在');

    const currentVersion: AssetVersion = {
      version: asset.version,
      fileUrl: asset.fileUrl,
      thumbnailUrl: asset.thumbnailUrl,
      fileSize: asset.fileSize,
      fileFormat: asset.fileFormat,
      resolution: asset.resolution,
      uploadedAt: asset.updatedAt,
      uploaderId: asset.uploaderId,
    };

    const historyVersions = asset.versions.map((v) => this.toAssetVersion(v));
    return [currentVersion, ...historyVersions].sort((a, b) => b.version - a.version);
  }

  private toAssetVersion(v: AssetVersionInfo): AssetVersion {
    return {
      version: v.version,
      fileUrl: v.fileUrl,
      thumbnailUrl: v.thumbnailUrl,
      fileSize: v.fileSize,
      fileFormat: v.fileFormat,
      resolution: v.resolution,
      uploadedAt: v.uploadedAt,
      uploaderId: v.uploaderId,
    };
  }

  private toAssetWithVersion(asset: AssetDocument): AssetWithVersion {
    return {
      _id: asset._id as Types.ObjectId,
      title: asset.title,
      description: asset.description,
      assetType: asset.assetType,
      fileFormat: asset.fileFormat,
      fileUrl: asset.fileUrl,
      thumbnailUrl: asset.thumbnailUrl,
      fileSize: asset.fileSize,
      resolution: asset.resolution,
      tags: asset.tags,
      categoryId: asset.categoryId,
      uploaderId: asset.uploaderId,
      licenseType: asset.licenseType,
      status: asset.status,
      downloadCount: asset.downloadCount,
      viewCount: asset.viewCount,
      version: asset.version,
      versions: asset.versions.map((v) => this.toAssetVersion(v)),
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  async create(payload: Partial<Asset>): Promise<AssetWithVersion> {
    if (!payload.assetType || !payload.fileFormat || !validateFileFormat(payload.assetType, payload.fileFormat)) {
      throw new BadRequestException('文件格式与素材类型不匹配');
    }

    const fileUrl = payload.fileUrl ?? this.storageService.presignedUploadUrl(`${Date.now()}-${payload.title ?? 'asset'}.${payload.fileFormat}`);
    if (!isHttpUrl(fileUrl)) {
      throw new BadRequestException('fileUrl 必须是有效的 HTTP URL');
    }

    const thumbnailUrl = payload.thumbnailUrl ?? thumbnailFromUrl(fileUrl);
    if (thumbnailUrl !== undefined && !isHttpUrl(thumbnailUrl)) {
      throw new BadRequestException('thumbnailUrl 必须是有效的 HTTP URL');
    }

    const now = new Date();
    const uploaderId = payload.uploaderId ?? 'system';

    const initialVersion: AssetVersionInfo = {
      version: 1,
      fileUrl,
      thumbnailUrl,
      fileSize: payload.fileSize ?? 0,
      fileFormat: payload.fileFormat,
      resolution: payload.resolution,
      uploadedAt: now,
      uploaderId,
    };

    const asset = await this.assetModel.create({
      ...payload,
      fileUrl,
      thumbnailUrl,
      version: 1,
      versions: [initialVersion],
    });
    await this.tagService.upsertMany(asset.tags ?? []);
    return this.toAssetWithVersion(asset);
  }

  async update(id: string, payload: Partial<Asset>): Promise<AssetWithVersion> {
    const existing = await this.assetModel.findById(id).exec();
    if (!existing) throw new NotFoundException('素材不存在');

    const newFileUrl = payload.fileUrl;
    const fileChanged = newFileUrl !== undefined && newFileUrl !== existing.fileUrl;

    if (fileChanged) {
      if (!isHttpUrl(newFileUrl)) {
        throw new BadRequestException('fileUrl 必须是有效的 HTTP URL');
      }

      const previousVersion: AssetVersionInfo = {
        version: existing.version,
        fileUrl: existing.fileUrl,
        thumbnailUrl: existing.thumbnailUrl,
        fileSize: existing.fileSize,
        fileFormat: existing.fileFormat,
        resolution: existing.resolution,
        uploadedAt: existing.updatedAt,
        uploaderId: existing.uploaderId,
      };

      const newVersion = existing.version + 1;
      const fileUrl = newFileUrl;
      const thumbnailUrl = payload.thumbnailUrl ?? thumbnailFromUrl(fileUrl);

      const updated = await this.assetModel
        .findByIdAndUpdate(
          id,
          {
            ...payload,
            fileUrl,
            thumbnailUrl,
            version: newVersion,
            $push: { versions: previousVersion },
          },
          { new: true },
        )
        .exec();

      if (!updated) throw new NotFoundException('更新失败，素材不存在');
      return this.toAssetWithVersion(updated);
    }

    const updated = await this.assetModel.findByIdAndUpdate(id, payload, { new: true }).exec();
    if (!updated) throw new NotFoundException('更新失败，素材不存在');
    return this.toAssetWithVersion(updated);
  }

  async publish(id: string): Promise<AssetWithVersion> {
    const asset = await this.assetModel.findByIdAndUpdate(id, { status: AssetStatus.Published }, { new: true }).exec();
    if (!asset) throw new NotFoundException('素材不存在');
    return this.toAssetWithVersion(asset);
  }

  async archive(id: string): Promise<AssetWithVersion> {
    const asset = await this.assetModel.findByIdAndUpdate(id, { status: AssetStatus.Archived }, { new: true }).exec();
    if (!asset) throw new NotFoundException('素材不存在');
    return this.toAssetWithVersion(asset);
  }

  async incrementDownload(id: string): Promise<AssetWithVersion> {
    const asset = await this.assetModel.findByIdAndUpdate(id, { $inc: { downloadCount: 1 } }, { new: true }).exec();
    if (!asset) throw new NotFoundException('素材不存在');
    return this.toAssetWithVersion(asset);
  }

  async getFileUrlByVersion(id: string, version?: number): Promise<string> {
    const asset = await this.assetModel.findById(id).exec();
    if (!asset) throw new NotFoundException('素材不存在');

    if (!version || version === asset.version) {
      return asset.fileUrl;
    }

    const targetVersion = asset.versions.find((v) => v.version === version);
    if (!targetVersion) throw new NotFoundException('版本不存在');

    return targetVersion.fileUrl;
  }
}
