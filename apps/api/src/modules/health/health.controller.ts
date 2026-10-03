import { Controller, Get, HttpStatus, Res, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { DatabaseService } from '../../database/database.service.js';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly dbService: DatabaseService) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  health() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({ status: 200, description: 'Service and DB are ready' })
  async ready(@Res() res: Response) {
    try {
      // Simple DB ping query
      await this.dbService.db.execute('SELECT 1');
      return res.status(HttpStatus.OK).json({
        status: 'ready',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: 'not_ready',
        database: 'disconnected',
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
