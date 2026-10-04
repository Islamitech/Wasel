import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service.js';
import { JwtAuthGuard } from '../identity/index.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for current user' })
  async listNotifications(@CurrentUser('userId') userId: string) {
    return this.notificationsService.listNotifications(userId);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notification as read' })
  async markRead(
    @Param('id') notificationId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.notificationsService.markAsRead(notificationId, userId);
  }
}
