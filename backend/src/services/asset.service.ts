import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Asset, AssetVersionInfo, type AssetDocument } from '../models/asset.schema';
import { AssetStatus } from '../types/enums';
import type { AssetVersion } from '../types/interfaces';
import { validateFileFormat } from '../utils/fileValidator';
import { thumbnailFromUrl } from '../utils/thumbnailGenerator';
import { TagService } from './tag.service';
import { StorageService } from './storage.service';

@Injectable()
export class AssetService {
  constructor(
    @InjectModel(Asset.name) private readonly assetModel: Model<AssetDocument>,
    private readonly tagService: TagService,
    private readonly storageService: StorageService,
  ) {}

  async findAll(query: { keyword?: string; tag?: string; status?: AssetStatus }) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.tag) filter.tags = query.tag;
    if (query.keyword) filter.$text = { $search: query.keyword };
    return this.assetModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string) {
    const asset = await this.assetModel.findByIdAndUpdate(id, { $inc: { viewCount: 1 } }, { new: true }).exec();
    if (!asset) throw new NotFoundException('素材不存在');
    return asset;
  }

  async findOneByVersion(id: string, version: number) {
    const asset = await this.assetModel.findById(id).exec();
    if (!asset) throw new NotFoundException('素材不存在');

    if (version === asset.version) {
      await this.assetModel.findByIdAndUpdate(id, { $inc: { viewCount: 1 } }, { new: true }).exec();
      return asset;
    }

    const targetVersion = asset.versions.find((v) => v.version === version);
    if (!targetVersion) throw new NotFoundException('版本不存在');

    await this.assetModel.findByIdAndUpdate(id, { $inc: { viewCount: 1 } }, { new: true }).exec();

    return {
      ...asset.toObject(),
      ...targetVersion,
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
      uploadedAt: asset.updatedAt ?? asset.createdAt,
      uploaderId: asset.uploaderId,
    };

    return [currentVersion, ...asset.versions.map((v) => this.toAssetVersion(v))].sort((a, b) => b.version - a.version);
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

  async create(payload: Partial<Asset>) {
    if (!payload.assetType || !payload.fileFormat || !validateFileFormat(payload.assetType, payload.fileFormat)) {
      throw new BadRequestException('文件格式与素材类型不匹配');
    }
    const fileUrl = payload.fileUrl ?? this.storageService.presignedUploadUrl(`${Date.now()}-${payload.title ?? 'asset'}.${payload.fileFormat}`);
    const thumbnailUrl = payload.thumbnailUrl ?? thumbnailFromUrl(fileUrl);
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
    return asset;
  }

  async update(id: string, payload: Partial<Asset>) {
    const existing = await this.assetModel.findById(id).exec();
    if (!existing) throw new NotFoundException('素材不存在');

    const fileChanged = payload.fileUrl && payload.fileUrl !== existing.fileUrl;

    if (fileChanged) {
      const previousVersion: AssetVersionInfo = {
        version: existing.version,
        fileUrl: existing.fileUrl,
        thumbnailUrl: existing.thumbnailUrl,
        fileSize: existing.fileSize,
        fileFormat: existing.fileFormat,
        resolution: existing.resolution,
        uploadedAt: existing.updatedAt ?? existing.createdAt,
        uploaderId: existing.uploaderId,
      };

      const newVersion = existing.version + 1;
      const fileUrl = payload.fileUrl;
      const thumbnailUrl = payload.thumbnailUrl ?? thumbnailFromUrl(fileUrl);

      return this.assetModel
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
    }

    return this.assetModel.findByIdAndUpdate(id, payload, { new: true }).exec();
  }

  publish(id: string) {
    return this.assetModel.findByIdAndUpdate(id, { status: AssetStatus.Published }, { new: true }).exec();
  }

  archive(id: string) {
    return this.assetModel.findByIdAndUpdate(id, { status: AssetStatus.Archived }, { new: true }).exec();
  }

  incrementDownload(id: string) {
    return this.assetModel.findByIdAndUpdate(id, { $inc: { downloadCount: 1 } }, { new: true }).exec();
  }

  async getFileUrlByVersion(id: string, version?: number) {
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
