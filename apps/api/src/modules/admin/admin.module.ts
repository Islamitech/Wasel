import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminFacade } from './admin.facade.js';
import { IdentityModule } from '../identity/index.js';

@Module({
  imports: [IdentityModule],
  controllers: [AdminController],
  providers: [AdminFacade],
  exports: [AdminFacade],
})
export class AdminModule {}
