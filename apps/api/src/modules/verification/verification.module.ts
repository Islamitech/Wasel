import { Module } from '@nestjs/common';
import { VerificationService } from './verification.service.js';
import { VerificationController } from './verification.controller.js';
import { VerificationFacade } from './verification.facade.js';
import { AuditModule } from '../audit/index.js';
import { S3StorageService } from '../../common/storage/s3-storage.service.js';

@Module({
  imports: [AuditModule],
  controllers: [VerificationController],
  providers: [VerificationService, VerificationFacade, S3StorageService],
  exports: [VerificationFacade, VerificationService],
})
export class VerificationModule {}
