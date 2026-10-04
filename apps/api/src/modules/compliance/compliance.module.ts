import { Module } from '@nestjs/common';
import { ComplianceService } from './compliance.service.js';
import { ComplianceController } from './compliance.controller.js';
import { AuditModule } from '../audit/index.js';

@Module({
  imports: [AuditModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
