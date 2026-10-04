import { Module } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { AdminController } from './admin.controller.js';
import { AdminFacade } from './admin.facade.js';
import { IdentityModule } from '../identity/index.js';
import { AuditModule } from '../audit/index.js';

@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [AdminController],
  providers: [AdminService, AdminFacade],
  exports: [AdminFacade, AdminService],
})
export class AdminModule {}
