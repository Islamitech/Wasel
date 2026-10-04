import { Controller, Get, Header, Res, Req, HttpStatus, Inject, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { MetricsService } from './metrics.service.js';
import { AppConfigService } from '../../config/config.service.js';

@ApiTags('Metrics')
@Controller('metrics')
export class MetricsController {
  constructor(
    @Inject(MetricsService) private readonly metricsService: MetricsService,
    @Inject(AppConfigService) private readonly configService: AppConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Prometheus metrics endpoint (protected)' })
  @ApiResponse({ status: 200, description: 'Prometheus metrics output' })
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(@Req() req: Request, @Res() res: Response) {
    const requiredToken = this.configService.get('METRICS_TOKEN') || process.env.METRICS_TOKEN;
    const isProduction =
      this.configService.get('APP_ENV') === 'production' ||
      process.env.APP_ENV === 'production' ||
      process.env.NODE_ENV === 'production';

    // Verify authentication if token is configured or in production
    if (requiredToken) {
      const authHeader = req.headers.authorization;
      const customHeader = req.headers['x-metrics-token'];
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const provided = customHeader || bearerToken;

      if (!provided || provided !== requiredToken) {
        throw new UnauthorizedException('Missing or invalid metrics authentication token');
      }
    } else if (isProduction) {
      // In production without METRICS_TOKEN, block external scraping
      throw new UnauthorizedException('METRICS_TOKEN must be configured to access metrics in production');
    }

    const metricsData = await this.metricsService.getMetricsText();
    return res.status(HttpStatus.OK).send(metricsData);
  }
}
