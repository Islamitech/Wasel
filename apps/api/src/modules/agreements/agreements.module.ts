import { Module } from '@nestjs/common';
import { AgreementsService } from './agreements.service.js';
import { AgreementsController } from './agreements.controller.js';
import { AgreementsFacade } from './agreements.facade.js';
import { SubscriptionsModule } from '../subscriptions/index.js';
import { VerificationModule } from '../verification/index.js';
import { EventsModule } from '../../common/events/events.module.js';
import { AuditModule } from '../audit/index.js';

@Module({
  imports: [SubscriptionsModule, VerificationModule, EventsModule, AuditModule],
  controllers: [AgreementsController],
  providers: [AgreementsService, AgreementsFacade],
  exports: [AgreementsFacade, AgreementsService],
})
export class AgreementsModule {}
