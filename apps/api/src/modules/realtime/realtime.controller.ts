import {
  Controller,
  Get,
  Req,
  Res,
  Headers,
  Query,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { RealtimeService } from './realtime.service.js';
import { IdentityFacade } from '../identity/index.js';
import * as crypto from 'crypto';

@ApiTags('Realtime SSE Stream')
@Controller()
export class RealtimeController {
  constructor(
    @Inject(RealtimeService) private readonly realtimeService: RealtimeService,
    @Inject(IdentityFacade) private readonly identityFacade: IdentityFacade,
  ) {}

  @Get('stream')
  @ApiOperation({ summary: 'Authenticated Server-Sent Events stream for realtime platform updates' })
  async stream(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('last-event-id') lastEventId?: string,
    @Query('token') queryToken?: string,
  ) {
    // Authenticate via Bearer header or query parameter (standard for browser EventSource)
    let token: string | undefined = queryToken;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      throw new UnauthorizedException('Authentication token required for SSE stream');
    }

    const authUser = await this.identityFacade.verifyAccessToken(token);
    const userId = authUser.sub;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx proxy buffering
    res.flushHeaders?.();

    const clientId = `client-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;
    this.realtimeService.addClient(clientId, userId, res, lastEventId);
  }
}
