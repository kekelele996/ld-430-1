import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AssetStatus, AssetType, LicenseType } from '../types/enums';

export type AssetDocument = HydratedDocument<Asset>;

@Schema()
export class AssetVersionInfo {
  @Prop({ required: true })
  version!: number;

  @Prop({ required: true, type: String, validate: (v: string) => v.startsWith('http') })
  fileUrl!: string;

  @Prop({ type: String, validate: (v: string) => !v || v.startsWith('http') })
  thumbnailUrl?: string;

  @Prop({ required: true, min: 0 })
  fileSize!: number;

  @Prop({ required: true })
  fileFormat!: string;

  @Prop({ type: { width: Number, height: Number } })
  resolution?: { width: number; height: number };

  @Prop({ required: true, type: Date })
  uploadedAt!: Date;

  @Prop({ required: true })
  uploaderId!: string;
}

export const AssetVersionInfoSchema = SchemaFactory.createForClass(AssetVersionInfo);

@Schema({ timestamps: true })
export class Asset {
  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ enum: AssetType, required: true })
  assetType!: AssetType;

  @Prop({ required: true })
  fileFormat!: string;

  @Prop({ required: true, type: String, validate: (v: string) => v.startsWith('http') })
  fileUrl!: string;

  @Prop({ type: String, validate: (v: string) => !v || v.startsWith('http') })
  thumbnailUrl?: string;

  @Prop({ required: true, min: 0 })
  fileSize!: number;

  @Prop({ type: { width: Number, height: Number } })
  resolution?: { width: number; height: number };

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ type: Types.ObjectId, ref: 'Category' })
  categoryId?: Types.ObjectId;

  @Prop({ required: true })
  uploaderId!: string;

  @Prop({ enum: LicenseType, default: LicenseType.Free })
  licenseType!: LicenseType;

  @Prop({ enum: AssetStatus, default: AssetStatus.Draft })
  status!: AssetStatus;

  @Prop({ default: 0, min: 0 })
  downloadCount!: number;

  @Prop({ default: 0, min: 0 })
  viewCount!: number;

  @Prop({ required: true, default: 1, min: 1 })
  version!: number;

  @Prop({ type: [AssetVersionInfoSchema], default: [] })
  versions!: AssetVersionInfo[];

  @Prop({ type: Date, required: true })
  createdAt!: Date;

  @Prop({ type: Date, required: true })
  updatedAt!: Date;
}

export const AssetSchema = SchemaFactory.createForClass(Asset);
AssetSchema.index({ title: 'text', description: 'text', tags: 'text' });
