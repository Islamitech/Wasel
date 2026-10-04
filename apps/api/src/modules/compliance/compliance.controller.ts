import {
  Controller,
  Get,
  Delete,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ComplianceService } from './compliance.service.js';
import { JwtAuthGuard } from '../identity/index.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Legal & Compliance (Law 151/2020)')
@Controller('compliance')
export class ComplianceController {
  constructor(
    @Inject(ComplianceService) private readonly complianceService: ComplianceService,
  ) {}

  @Get('privacy-policy')
  @ApiOperation({ summary: 'Get Arabic privacy policy compliant with Egyptian Law 151/2020' })
  getPrivacyPolicy() {
    return this.complianceService.getPrivacyPolicy();
  }

  @Get('terms')
  @ApiOperation({ summary: 'Get Arabic terms and conditions for Wasel platform' })
  getTermsOfService() {
    return this.complianceService.getTermsOfService();
  }

  @Get('export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export full personal data package (Law 151/2020 Data Portability)' })
  async exportUserData(@CurrentUser('userId') userId: string) {
    return this.complianceService.exportUserData(userId);
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request permanent account erasure and data anonymization' })
  async deleteAccount(
    @CurrentUser('userId') userId: string,
    @Body() body?: { reason?: string },
  ) {
    return this.complianceService.deleteUserAccount(userId, body?.reason);
  }
}
