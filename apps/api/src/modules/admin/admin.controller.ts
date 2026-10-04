import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/index.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { SettingsService } from '../../common/settings/settings.service.js';
import { AuditService } from '../audit/index.js';
import { AdminService } from './admin.service.js';
import {
  SettingUpdateSchema,
  SettingUpdateDto,
  AdminPricingRuleSchema,
  AdminPricingRuleDto,
  AdminEscalationRuleSchema,
  AdminEscalationRuleDto,
  AdminUserSearchQuerySchema,
  AdminUserSearchQueryDto,
  UserRole,
} from '@wasel/shared';

@ApiTags('Admin Console')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly adminService: AdminService,
    @Inject(SettingsService) private readonly settingsService: SettingsService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Admin system operational health summary' })
  async getOverview() {
    return {
      status: 'operational',
      region: 'EG-GZ-HDA',
      activeFeatures: ['identity', 'catalog', 'regions', 'orders', 'offers', 'agreements', 'matching', 'ratings', 'sse'],
      timestamp: new Date().toISOString(),
    };
  }

  // --- Dynamic Settings ---

  @Put('settings')
  @ApiOperation({ summary: 'Update dynamic system/region setting' })
  async updateSetting(
    @Body(new ZodValidationPipe(SettingUpdateSchema)) dto: SettingUpdateDto,
    @CurrentUser('userId') adminId: string,
  ) {
    const previous = await this.settingsService.get<any>(dto.key, dto.regionId, null);
    await this.settingsService.set(dto.key, dto.value, adminId, dto.regionId);

    await this.auditService.log({
      userId: adminId,
      action: 'UPDATE',
      entityType: 'settings',
      entityId: dto.key,
      beforeState: previous,
      afterState: dto.value,
    });

    return { success: true, message: 'تم حفظ الإعدادات بنجاح' };
  }

  // --- Versioned Pricing Rules ---

  @Get('pricing-rules')
  @ApiOperation({ summary: 'List versioned pricing fee structures' })
  async listPricingRules() {
    return this.adminService.listPricingRules();
  }

  @Post('pricing-rules')
  @ApiOperation({ summary: 'Create new version of pricing rules (never edited in place)' })
  async createPricingRule(
    @CurrentUser('userId') adminId: string,
    @Body(new ZodValidationPipe(AdminPricingRuleSchema)) dto: AdminPricingRuleDto,
  ) {
    return this.adminService.createVersionedPricingRule(adminId, dto);
  }

  // --- Reference Tables CRUD ---

  @Get('vehicle-types')
  @ApiOperation({ summary: 'List fleet vehicle types' })
  async getVehicleTypes() {
    return this.adminService.getVehicleTypes();
  }

  @Post('vehicle-types')
  @ApiOperation({ summary: 'Add a new vehicle type to fleet' })
  async createVehicleType(
    @CurrentUser('userId') adminId: string,
    @Body() body: any,
  ) {
    return this.adminService.createVehicleType(adminId, body);
  }

  @Get('value-tiers')
  @ApiOperation({ summary: 'List cargo value risk tiers' })
  async getValueTiers() {
    return this.adminService.getValueTiers();
  }

  @Post('value-tiers')
  @ApiOperation({ summary: 'Add cargo value tier' })
  async createValueTier(
    @CurrentUser('userId') adminId: string,
    @Body() body: any,
  ) {
    return this.adminService.createValueTier(adminId, body);
  }

  @Get('service-actions')
  @ApiOperation({ summary: 'List stop actions (buy, pick, drop, move, find)' })
  async getServiceActions() {
    return this.adminService.getServiceActions();
  }

  @Post('service-actions')
  @ApiOperation({ summary: 'Create service action' })
  async createServiceAction(
    @CurrentUser('userId') adminId: string,
    @Body() body: any,
  ) {
    return this.adminService.createServiceAction(adminId, body);
  }

  @Get('load-sizes')
  @ApiOperation({ summary: 'List cargo load classifications' })
  async getLoadSizes() {
    return this.adminService.getLoadSizes();
  }

  @Post('load-sizes')
  @ApiOperation({ summary: 'Create cargo load size' })
  async createLoadSize(
    @CurrentUser('userId') adminId: string,
    @Body() body: any,
  ) {
    return this.adminService.createLoadSize(adminId, body);
  }

  @Get('escalation-rules')
  @ApiOperation({ summary: 'List dispatch escalation parameters' })
  async getEscalationRules() {
    return this.adminService.getEscalationRules();
  }

  @Post('escalation-rules')
  @ApiOperation({ summary: 'Create dispatch escalation rule' })
  async createEscalationRule(
    @CurrentUser('userId') adminId: string,
    @Body(new ZodValidationPipe(AdminEscalationRuleSchema)) dto: AdminEscalationRuleDto,
  ) {
    return this.adminService.createEscalationRule(adminId, dto);
  }

  @Get('roles')
  @ApiOperation({ summary: 'List RBAC roles' })
  async getRoles() {
    return this.adminService.getRoles();
  }

  @Get('permissions')
  @ApiOperation({ summary: 'List RBAC permissions' })
  async getPermissions() {
    return this.adminService.getPermissions();
  }

  // --- Dashboards ---

  @Get('dashboard/orders')
  @ApiOperation({ summary: 'Metrics: orders volume and breakdown by status' })
  async getOrdersDashboard() {
    return this.adminService.getOrdersDashboard();
  }

  @Get('dashboard/drivers')
  @ApiOperation({ summary: 'Fleet metrics: active, online, trial, pending verification' })
  async getDriversDashboard() {
    return this.adminService.getDriversDashboard();
  }

  @Get('dashboard/subscriptions')
  @ApiOperation({ summary: 'Subscription pipeline metrics and expirations' })
  async getSubscriptionsDashboard() {
    return this.adminService.getSubscriptionsDashboard();
  }

  @Get('dashboard/disputes')
  @ApiOperation({ summary: 'Dispute arbitration queue counts' })
  async getDisputesDashboard() {
    return this.adminService.getDisputesDashboard();
  }

  // --- Users Search with Masked PII ---

  @Get('users')
  @ApiOperation({ summary: 'Search users with masked sensitive data' })
  @ApiQuery({ name: 'q', required: false })
  async searchUsers(
    @Query(new ZodValidationPipe(AdminUserSearchQuerySchema)) query: AdminUserSearchQueryDto,
  ) {
    return this.adminService.searchUsers(query);
  }
}
