import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service.js';
import { AppConfigModule } from '../../config/config.module.js';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
