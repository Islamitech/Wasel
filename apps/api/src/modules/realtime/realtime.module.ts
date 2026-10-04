import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeService } from './realtime.service.js';
import { RealtimeController } from './realtime.controller.js';

@Module({
  controllers: [RealtimeController],
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeGateway, RealtimeService],
})
export class RealtimeModule {}

