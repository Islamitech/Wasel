import { Module, Global } from '@nestjs/common';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';
import { MetricsInterceptor } from './metrics.interceptor.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AppConfigModule } from '../../config/config.module.js';

@Global()
@Module({
  imports: [DatabaseModule, AppConfigModule],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsInterceptor],
  exports: [MetricsService, MetricsInterceptor],
})
export class MetricsModule {}
