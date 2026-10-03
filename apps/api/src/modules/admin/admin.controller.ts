import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  PermissionsGuard,
  Permissions,
  CurrentUser,
} from '../identity/index.js';
import { SettingsService } from '../../common/settings/settings.service.js';
import { AuditService } from '../audit/index.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { SettingUpdateSchema, SettingUpdateDto } from '@wasel/shared';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly auditService: AuditService,
  ) {}

  @Get('overview')
  @Permissions('users:read')
  @ApiOperation({ summary: 'Admin system health overview' })
  async getOverview() {
    return {
      status: 'operational',
      region: 'EG-GZ-HDA',
      activeFeatures: ['identity', 'catalog', 'regions', 'settings', 'audit', 'outbox'],
      timestamp: new Date().toISOString(),
    };
  }

  @Put('settings')
  @Permissions('settings:write')
  @ApiOperation({ summary: 'Update system setting' })
  async updateSetting(
    @Body(new ZodValidationPipe(SettingUpdateSchema)) dto: SettingUpdateDto,
    @CurrentUser() user: any,
  ) {
    const previous = await this.settingsService.get<any>(dto.key, dto.regionId, null);
    await this.settingsService.set(dto.key, dto.value, user.sub, dto.regionId);

    await this.auditService.log({
      userId: user.sub,
      action: 'UPDATE',
      entityType: 'settings',
      entityId: dto.key,
      beforeState: previous,
      afterState: dto.value,
    });

    return {
      success: true,
      message: 'تم تحديث الإعدادات بنجاح',
    };
  }
}
