import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MessagingService } from './messaging.service.js';
import { JwtAuthGuard } from '../identity/index.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { SendMessageSchema, SendMessageDto } from '@wasel/shared';

@ApiTags('In-App Messaging')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MessagingController {
  constructor(@Inject(MessagingService) private readonly messagingService: MessagingService) {}

  @Get('agreements/:id/messages')
  @ApiOperation({ summary: 'Retrieve conversation messages for an agreement (participants only)' })
  async getMessages(
    @Param('id') agreementId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') rolesList: string[],
  ) {
    return this.messagingService.getAgreementMessages(agreementId, userId, rolesList || []);
  }

  @Post('agreements/:id/messages')
  @ApiOperation({ summary: 'Send text or voice/image message within trip channel' })
  async sendMessage(
    @Param('id') agreementId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') rolesList: string[],
    @Body(new ZodValidationPipe(SendMessageSchema)) dto: SendMessageDto,
  ) {
    return this.messagingService.sendMessage(agreementId, userId, dto, rolesList || []);
  }

  @Post('messages/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark message as read' })
  async markRead(
    @Param('id') messageId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.messagingService.markMessageRead(messageId, userId);
  }
}
