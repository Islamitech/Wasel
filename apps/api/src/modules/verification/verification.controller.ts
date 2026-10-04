import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { VerificationService } from './verification.service.js';
import { JwtAuthGuard } from '../identity/index.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  DriverProfileCreateSchema,
  DriverProfileCreateDto,
  RegisterVehicleSchema,
  RegisterVehicleDto,
  SubmitDocumentSchema,
  SubmitDocumentDto,
  DocumentUploadUrlRequestSchema,
  DocumentUploadUrlRequestDto,
  AdminReviewVerificationSchema,
  UserRole,
} from '@wasel/shared';

@ApiTags('Driver Onboarding & Verification')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class VerificationController {
  constructor(@Inject(VerificationService) private readonly verificationService: VerificationService) {}

  @Post('driver/profile')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Initialize or update captain profile' })
  async upsertProfile(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(DriverProfileCreateSchema)) dto: DriverProfileCreateDto,
  ) {
    return this.verificationService.upsertDriverProfile(userId, dto);
  }

  @Post('driver/vehicles')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Register a vehicle under driver profile' })
  async registerVehicle(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(RegisterVehicleSchema)) dto: RegisterVehicleDto,
  ) {
    return this.verificationService.registerVehicle(userId, dto);
  }

  @Post('driver/documents/upload-url')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get pre-signed upload URL for private verification document' })
  async getUploadUrl(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(DocumentUploadUrlRequestSchema)) dto: DocumentUploadUrlRequestDto,
  ) {
    return this.verificationService.getUploadUrl(userId, dto.mediaType);
  }

  @Post('driver/vehicles/upload-url')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get pre-signed upload URL for vehicle photo' })
  async getVehiclePhotoUploadUrl(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(DocumentUploadUrlRequestSchema)) dto: DocumentUploadUrlRequestDto,
  ) {
    return this.verificationService.getVehiclePhotoUploadUrl(userId, dto.mediaType);
  }

  @Post('driver/documents')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Submit KYC / vehicle document for verification review' })
  async submitDocument(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(SubmitDocumentSchema)) dto: SubmitDocumentDto,
  ) {
    return this.verificationService.submitDocument(userId, dto);
  }

  @Get('driver/verification')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get current captain verification tier and missing documents' })
  async getVerificationStatus(@CurrentUser('userId') userId: string) {
    return this.verificationService.getVerificationStatus(userId);
  }

  // --- Admin Verification Review Endpoints ---

  @Get('admin/verifications')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiOperation({ summary: 'List pending verification documents' })
  @ApiQuery({ name: 'status', required: false })
  async listVerifications(@Query('status') status?: string) {
    return this.verificationService.adminListVerifications(status);
  }

  @Get('admin/verifications/:id/document-url')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Get temporary secure presigned URL to view verification document' })
  async adminGetDocumentUrl(
    @Param('id') id: string,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.verificationService.adminGetDocumentUrl(id, adminId);
  }

  @Post('admin/verifications/:id/approve')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve driver verification document' })
  async approveVerification(
    @Param('id') id: string,
    @CurrentUser('userId') adminId: string,
    @Body() body: { levelId?: string },
  ) {
    return this.verificationService.adminReviewDocument(id, adminId, {
      status: 'approved',
      levelId: body?.levelId,
    });
  }

  @Post('admin/verifications/:id/reject')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject driver verification document with reason' })
  async rejectVerification(
    @Param('id') id: string,
    @CurrentUser('userId') adminId: string,
    @Body(new ZodValidationPipe(AdminReviewVerificationSchema.pick({ rejectReason: true })))
    body: { rejectReason?: string },
  ) {
    return this.verificationService.adminReviewDocument(id, adminId, {
      status: 'rejected',
      rejectReason: body.rejectReason,
    });
  }
}
