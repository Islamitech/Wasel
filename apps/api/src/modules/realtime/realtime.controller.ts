import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Headers,
  Query,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { RealtimeService } from './realtime.service.js';
import { IdentityFacade, JwtAuthGuard } from '../identity/index.js';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import * as crypto from 'crypto';

@ApiTags('Realtime SSE Stream')
@Controller()
export class RealtimeController {
  constructor(
    @Inject(RealtimeService) private readonly realtimeService: RealtimeService,
    @Inject(IdentityFacade) private readonly identityFacade: IdentityFacade,
  ) {}

  @Post('stream/ticket')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate a short-lived (30s) single-use ticket for authenticated SSE stream connection',
  })
  async createTicket(@CurrentUser() user: AuthenticatedUser) {
    const userId = user.userId || user.sub;
    const roles = user.roles || [];
    const ticket = await this.realtimeService.createTicket(userId, roles);
    return {
      ticket,
      expiresIn: 30,
    };
  }

  @Get('stream')
  @ApiOperation({
    summary: 'Authenticated Server-Sent Events stream using one-time ticket or Bearer token',
  })
  async stream(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('last-event-id') lastEventIdHeader?: string,
    @Query('ticket') queryTicket?: string,
    @Query('lastEventId') queryLastEventId?: string,
  ) {
    const lastEventId = lastEventIdHeader || queryLastEventId;
    let userId: string;

    // 1. Authenticate via single-use ticket (preferred for browser EventSource)
    if (queryTicket) {
      const ticketData = await this.realtimeService.consumeTicket(queryTicket);
      if (!ticketData) {
        throw new UnauthorizedException('تذكرة البث غير صالحة أو منتهية الصلاحية');
      }
      userId = ticketData.userId;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      const token = req.headers.authorization.split(' ')[1];
      if (!token) {
        throw new UnauthorizedException('رمز الوصول مفقود');
      }
      const authUser = await this.identityFacade.verifyAccessToken(token);
      userId = authUser.sub;
    } else {
      throw new UnauthorizedException(
        'مطلوب تذكرة صالحة لفتح قناة البث المباشر. احصل على تذكرة أولاً عبر POST /stream/ticket',
      );
    }

    // 3. Enforce per-user concurrent connection limit
    const allowed = this.realtimeService.canUserConnect(userId);
    if (!allowed) {
      throw new HttpException(
        'تم تجاوز الحد الأقصى للاتصالات المتزامنة المسموح بها للمستخدم',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 4. Configure SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx proxy buffering
    res.flushHeaders?.();

    const clientId = `client-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;
    await this.realtimeService.addClient(clientId, userId, res, lastEventId);
  }
}

