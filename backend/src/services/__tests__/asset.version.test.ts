import { Types } from 'mongoose';
import { Asset, AssetVersionInfo } from '../../models/asset.schema';
import { AssetService } from '../asset.service';
import { TagService } from '../tag.service';
import { StorageService } from '../storage.service';
import { AssetType, LicenseType, AssetStatus } from '../../types/enums';
import type { AssetWithVersion } from '../../types/interfaces';

type MockModel = {
  find: jest.Mock;
  findById: jest.Mock;
  findByIdAndUpdate: jest.Mock;
  findByIdAndDelete: jest.Mock;
  create: jest.Mock;
};

describe('AssetVersion', () => {
  let assetService: AssetService;
  let mockAssetModel: MockModel;
  let mockTagService: jest.Mocked<TagService>;
  let mockStorageService: jest.Mocked<StorageService>;

  const now = new Date();
  const assetId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const uploaderId = 'user-123';

  const createMockAsset = (version: number, fileUrl: string, versions: AssetVersionInfo[] = []): any => ({
    _id: assetId,
    title: 'Test Asset',
    description: 'Test Description',
    assetType: AssetType.Image,
    fileFormat: 'png',
    fileUrl,
    thumbnailUrl: `${fileUrl}-thumb`,
    fileSize: 1024 * version,
    tags: ['test'],
    uploaderId,
    licenseType: LicenseType.Free,
    status: AssetStatus.Draft,
    downloadCount: 0,
    viewCount: 0,
    version,
    versions,
    createdAt: now,
    updatedAt: now,
    toObject: jest.fn(function () {
      return {
        _id: this._id,
        title: this.title,
        description: this.description,
        assetType: this.assetType,
        fileFormat: this.fileFormat,
        fileUrl: this.fileUrl,
        thumbnailUrl: this.thumbnailUrl,
        fileSize: this.fileSize,
        tags: this.tags,
        uploaderId: this.uploaderId,
        licenseType: this.licenseType,
        status: this.status,
        downloadCount: this.downloadCount,
        viewCount: this.viewCount,
        version: this.version,
        versions: this.versions,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
      };
    }),
  });

  beforeEach(() => {
    mockAssetModel = {
      find: jest.fn().mockReturnThis(),
      findById: jest.fn().mockReturnThis(),
      findByIdAndUpdate: jest.fn().mockReturnThis(),
      findByIdAndDelete: jest.fn().mockReturnThis(),
      create: jest.fn(),
    } as unknown as MockModel;

    mockTagService = {
      upsertMany: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TagService>;

    mockStorageService = {
      presignedUploadUrl: jest.fn().mockReturnValue('http://minio/test.png'),
    } as unknown as jest.Mocked<StorageService>;

    (mockAssetModel.find as jest.Mock).mockReturnThis();
    (mockAssetModel.find as any).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    });

    assetService = new AssetService(
      mockAssetModel as any,
      mockTagService,
      mockStorageService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create - 新建素材', () => {
    it('新建素材后 version=1，versions 数组为空，不重复', async () => {
      const payload: Partial<Asset> = {
        title: 'Test Asset',
        description: 'Test Description',
        assetType: AssetType.Image,
        fileFormat: 'png',
        fileUrl: 'http://minio/v1.png',
        fileSize: 1024,
        uploaderId,
      };

      const mockCreated = createMockAsset(1, 'http://minio/v1.png', []);
      mockAssetModel.create.mockResolvedValue(mockCreated);

      const result = await assetService.create(payload);

      expect(result.version).toBe(1);
      expect(result.versions).toHaveLength(0);
      expect(mockAssetModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 1,
          versions: [],
        }),
      );
    });
  });

  describe('findVersions - 版本列表', () => {
    it('新建素材后版本列表只有 1 条记录，不重复', async () => {
      const mockAsset = createMockAsset(1, 'http://minio/v1.png', []);
      mockAssetModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAsset),
      });
      mockAssetModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAsset),
      });

      const versions = await assetService.findVersions(assetId.toHexString());

      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe(1);
      expect(versions[0].fileUrl).toBe('http://minio/v1.png');
    });

    it('更新 1 次后版本列表有 2 条记录，新旧各一条，不重复', async () => {
      const historyVersion: AssetVersionInfo = {
        version: 1,
        fileUrl: 'http://minio/v1.png',
        thumbnailUrl: 'http://minio/v1.png-thumb',
        fileSize: 1024,
        fileFormat: 'png',
        uploadedAt: now,
        uploaderId,
      };
      const mockAsset = createMockAsset(2, 'http://minio/v2.png', [historyVersion]);
      mockAssetModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAsset),
      });
      mockAssetModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAsset),
      });

      const versions = await assetService.findVersions(assetId.toHexString());

      expect(versions).toHaveLength(2);
      expect(versions[0].version).toBe(2);
      expect(versions[0].fileUrl).toBe('http://minio/v2.png');
      expect(versions[1].version).toBe(1);
      expect(versions[1].fileUrl).toBe('http://minio/v1.png');

      const versionNumbers = versions.map((v) => v.version);
      expect(new Set(versionNumbers).size).toBe(versionNumbers.length);
    });

    it('更新 2 次后版本列表有 3 条记录，按版本号降序', async () => {
      const history: AssetVersionInfo[] = [
        {
          version: 1,
          fileUrl: 'http://minio/v1.png',
          thumbnailUrl: 'http://minio/v1.png-thumb',
          fileSize: 1024,
          fileFormat: 'png',
          uploadedAt: now,
          uploaderId,
        },
        {
          version: 2,
          fileUrl: 'http://minio/v2.png',
          thumbnailUrl: 'http://minio/v2.png-thumb',
          fileSize: 2048,
          fileFormat: 'png',
          uploadedAt: now,
          uploaderId,
        },
      ];
      const mockAsset = createMockAsset(3, 'http://minio/v3.png', history);
      mockAssetModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAsset),
      });
      mockAssetModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAsset),
      });

      const versions = await assetService.findVersions(assetId.toHexString());

      expect(versions).toHaveLength(3);
      expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
      expect(versions.map((v) => v.fileUrl)).toEqual([
        'http://minio/v3.png',
        'http://minio/v2.png',
        'http://minio/v1.png',
      ]);

      const versionNumbers = versions.map((v) => v.version);
      expect(new Set(versionNumbers).size).toBe(versionNumbers.length);
    });

    it('即使 versions 数组有重复版本号，返回结果也会去重（双保险）', async () => {
      const duplicatedHistory: AssetVersionInfo[] = [
        {
          version: 2,
          fileUrl: 'http://minio/v2-dup.png',
          thumbnailUrl: 'http://minio/v2-dup.png-thumb',
          fileSize: 2048,
          fileFormat: 'png',
          uploadedAt: now,
          uploaderId,
        },
        {
          version: 2,
          fileUrl: 'http://minio/v2-dup2.png',
          thumbnailUrl: 'http://minio/v2-dup2.png-thumb',
          fileSize: 2048,
          fileFormat: 'png',
          uploadedAt: now,
          uploaderId,
        },
      ];
      const mockAsset = createMockAsset(2, 'http://minio/v2.png', duplicatedHistory);
      mockAssetModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAsset),
      });
      mockAssetModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAsset),
      });

      const versions = await assetService.findVersions(assetId.toHexString());

      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe(2);
    });
  });

  describe('findOneByVersion - 按版本查询', () => {
    it('查询最新版本（当前版本），返回正确的文件信息', async () => {
      const history: AssetVersionInfo[] = [
        {
          version: 1,
          fileUrl: 'http://minio/v1.png',
          thumbnailUrl: 'http://minio/v1.png-thumb',
          fileSize: 1024,
          fileFormat: 'png',
          uploadedAt: now,
          uploaderId,
        },
      ];
      const mockAsset = createMockAsset(2, 'http://minio/v2.png', history);
      mockAssetModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAsset),
      });
      mockAssetModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAsset),
      });

      const result = await assetService.findOneByVersion(assetId.toHexString(), 2);

      expect(result.version).toBe(2);
      expect(result.fileUrl).toBe('http://minio/v2.png');
      expect(result.fileSize).toBe(2048);
    });

    it('查询历史版本 v1，返回旧版文件信息，元数据仍是最新', async () => {
      const v1UploadedAt = new Date(now.getTime() - 86400000);
      const history: AssetVersionInfo[] = [
        {
          version: 1,
          fileUrl: 'http://minio/v1.png',
          thumbnailUrl: 'http://minio/v1.png-thumb',
          fileSize: 1024,
          fileFormat: 'png',
          uploadedAt: v1UploadedAt,
          uploaderId,
        },
      ];
      const mockAsset = createMockAsset(2, 'http://minio/v2.png', history);
      mockAssetModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAsset),
      });
      mockAssetModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAsset),
      });

      const result = (await assetService.findOneByVersion(assetId.toHexString(), 1)) as AssetWithVersion;

      expect(result.version).toBe(1);
      expect(result.fileUrl).toBe('http://minio/v1.png');
      expect(result.fileSize).toBe(1024);
      expect(result.thumbnailUrl).toBe('http://minio/v1.png-thumb');
      expect(result.title).toBe('Test Asset');
      expect(result.description).toBe('Test Description');
      expect(result.updatedAt).toEqual(v1UploadedAt);
    });

    it('查询不存在的版本号，抛出 NotFoundException', async () => {
      const mockAsset = createMockAsset(2, 'http://minio/v2.png', []);
      mockAssetModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAsset),
      });
      mockAssetModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAsset),
      });

      await expect(
        assetService.findOneByVersion(assetId.toHexString(), 999),
      ).rejects.toThrow('版本不存在');
    });
  });

  describe('getFileUrlByVersion - 下载链接', () => {
    it('不传 version 默认返回最新版 fileUrl', async () => {
      const history: AssetVersionInfo[] = [
        {
          version: 1,
          fileUrl: 'http://minio/v1.png',
          thumbnailUrl: 'http://minio/v1.png-thumb',
          fileSize: 1024,
          fileFormat: 'png',
          uploadedAt: now,
          uploaderId,
        },
      ];
      const mockAsset = createMockAsset(2, 'http://minio/v2.png', history);
      mockAssetModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAsset),
      });

      const url = await assetService.getFileUrlByVersion(assetId.toHexString());
      expect(url).toBe('http://minio/v2.png');
    });

    it('传 version=1 返回旧版 fileUrl', async () => {
      const history: AssetVersionInfo[] = [
        {
          version: 1,
          fileUrl: 'http://minio/v1.png',
          thumbnailUrl: 'http://minio/v1.png-thumb',
          fileSize: 1024,
          fileFormat: 'png',
          uploadedAt: now,
          uploaderId,
        },
      ];
      const mockAsset = createMockAsset(2, 'http://minio/v2.png', history);
      mockAssetModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAsset),
      });

      const url = await assetService.getFileUrlByVersion(assetId.toHexString(), 1);
      expect(url).toBe('http://minio/v1.png');
    });
  });

  describe('update - 更新素材', () => {
    it('更新 fileUrl 时，旧版归档到 versions，version 自增', async () => {
      const existing = createMockAsset(1, 'http://minio/v1.png', []);
      mockAssetModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(existing),
      });

      const updated = createMockAsset(2, 'http://minio/v2.png', [
        {
          version: 1,
          fileUrl: 'http://minio/v1.png',
          thumbnailUrl: 'http://minio/v1.png-thumb',
          fileSize: 1024,
          fileFormat: 'png',
          uploadedAt: now,
          uploaderId,
        },
      ]);
      mockAssetModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updated),
      });

      const result = await assetService.update(assetId.toHexString(), {
        fileUrl: 'http://minio/v2.png',
        fileSize: 2048,
      });

      expect(result.version).toBe(2);
      expect(result.fileUrl).toBe('http://minio/v2.png');
      expect(result.versions).toHaveLength(1);
      expect(result.versions[0].version).toBe(1);
      expect(result.versions[0].fileUrl).toBe('http://minio/v1.png');

      expect(mockAssetModel.findByIdAndUpdate).toHaveBeenCalledWith(
        assetId.toHexString(),
        expect.objectContaining({
          version: 2,
          $push: expect.objectContaining({
            versions: expect.objectContaining({
              version: 1,
              fileUrl: 'http://minio/v1.png',
            }),
          }),
        }),
        { new: true },
      );
    });

    it('更新非 fileUrl 字段时，version 不变，versions 不变', async () => {
      const existing = createMockAsset(2, 'http://minio/v2.png', [
        {
          version: 1,
          fileUrl: 'http://minio/v1.png',
          thumbnailUrl: 'http://minio/v1.png-thumb',
          fileSize: 1024,
          fileFormat: 'png',
          uploadedAt: now,
          uploaderId,
        },
      ]);
      mockAssetModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(existing),
      });

      const updated = { ...existing, title: 'New Title' };
      mockAssetModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updated),
      });

      const result = await assetService.update(assetId.toHexString(), {
        title: 'New Title',
      });

      expect(result.version).toBe(2);
      expect(result.fileUrl).toBe('http://minio/v2.png');
      expect(result.versions).toHaveLength(1);

      expect(mockAssetModel.findByIdAndUpdate).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $push: expect.anything(),
        }),
        expect.anything(),
      );
    });
  });
});
