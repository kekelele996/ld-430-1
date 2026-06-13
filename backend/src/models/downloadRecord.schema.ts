import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { DownloadPurpose } from '../types/enums';

export type DownloadRecordDocument = HydratedDocument<DownloadRecord>;

@Schema({ timestamps: true })
export class DownloadRecord {
  @Prop({ type: Types.ObjectId, ref: 'Asset', required: true })
  assetId!: Types.ObjectId;

  @Prop({ required: true })
  downloaderId!: string;

  @Prop({ default: () => new Date() })
  downloadedAt!: Date;

  @Prop({ enum: DownloadPurpose, required: true })
  purpose!: DownloadPurpose;

  @Prop({ required: true })
  licenseVersion!: string;

  @Prop({ required: true, default: 1, min: 1 })
  assetVersion!: number;

  @Prop({ required: true, type: String, validate: (v: string) => v.startsWith('http') })
  fileUrl!: string;
}

export const DownloadRecordSchema = SchemaFactory.createForClass(DownloadRecord);
