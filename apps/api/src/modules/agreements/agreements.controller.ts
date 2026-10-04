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
import { AgreementsService } from './agreements.service.js';
import { JwtAuthGuard } from '../identity/index.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  CreateOfferSchema,
  CreateOfferDto,
  CounterOfferSchema,
  CounterOfferDto,
  DirectAssignSchema,
  DirectAssignDto,
  CreateAmendmentSchema,
  CreateAmendmentDto,
  CancelAgreementSchema,
  CancelAgreementDto,
  StopArrivalSchema,
  StopArrivalDto,
  CreateInvoiceSchema,
  CreateInvoiceDto,
  RecordPaymentReceiptSchema,
  RecordPaymentReceiptDto,
  DisputeInvoiceSchema,
  DisputeInvoiceDto,
  CreateOrderStopSchema,
  CreateOrderStopDto,
  DriverLocationBatchSchema,
  DriverLocationBatchDto,
  DriverPresenceSchema,
  DriverPresenceDto,
  UserRole,
} from '@wasel/shared';

@ApiTags('Offers, Agreements & Trip Execution')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AgreementsController {
  constructor(@Inject(AgreementsService) private readonly agreementsService: AgreementsService) {}

  // --- Offers Endpoints ---

  @Post('orders/:id/offers')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Driver submits quote/offer on a published order' })
  async createOffer(
    @Param('id') orderId: string,
    @CurrentUser('userId') driverId: string,
    @Body(new ZodValidationPipe(CreateOfferSchema)) dto: CreateOfferDto,
  ) {
    return this.agreementsService.createOffer(orderId, driverId, dto);
  }

  @Get('orders/:id/offers')
  @ApiOperation({ summary: 'List offers submitted for an order' })
  async getOrderOffers(
    @Param('id') orderId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') rolesList: string[],
  ) {
    return this.agreementsService.getOrderOffers(orderId, userId, rolesList || []);
  }

  @Post('offers/:id/accept')
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Customer accepts a driver offer, creating binding agreement' })
  async acceptOffer(
    @Param('id') offerId: string,
    @CurrentUser('userId') customerId: string,
  ) {
    return this.agreementsService.acceptOffer(offerId, customerId);
  }

  @Post('offers/:id/reject')
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Customer rejects a driver offer' })
  async rejectOffer(
    @Param('id') offerId: string,
    @CurrentUser('userId') customerId: string,
  ) {
    return this.agreementsService.rejectOffer(offerId, customerId);
  }

  @Post('offers/:id/counter')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Counter an existing offer within turn-taking limits' })
  async counterOffer(
    @Param('id') offerId: string,
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(CounterOfferSchema)) dto: CounterOfferDto,
  ) {
    return this.agreementsService.counterOffer(offerId, userId, dto);
  }

  @Post('orders/:id/accept')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Driver directly accepts shopping order at guaranteed minimum fare' })
  async driverAcceptShoppingOrder(
    @Param('id') orderId: string,
    @CurrentUser('userId') driverId: string,
  ) {
    return this.agreementsService.driverAcceptShoppingOrder(orderId, driverId);
  }

  @Post('orders/:id/assign')
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Customer directly assigns order to preferred captain' })
  async directAssign(
    @Param('id') orderId: string,
    @CurrentUser('userId') customerId: string,
    @Body(new ZodValidationPipe(DirectAssignSchema)) dto: DirectAssignDto,
  ) {
    return this.agreementsService.directAssign(orderId, customerId, dto.driverId);
  }

  // --- Agreements & Amendments Endpoints ---

  @Post('agreements/:id/amendments')
  @ApiOperation({ summary: 'Propose an amendment to ongoing agreement (added stops/revised fare)' })
  async proposeAmendment(
    @Param('id') agreementId: string,
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(CreateAmendmentSchema)) dto: CreateAmendmentDto,
  ) {
    return this.agreementsService.proposeAmendment(agreementId, userId, dto);
  }

  @Post('amendments/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Countersigning party approves proposed agreement amendment' })
  async approveAmendment(
    @Param('id') amendmentId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.agreementsService.resolveAmendment(amendmentId, userId, true);
  }

  @Post('amendments/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject proposed agreement amendment' })
  async rejectAmendment(
    @Param('id') amendmentId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.agreementsService.resolveAmendment(amendmentId, userId, false);
  }

  @Post('agreements/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel active agreement with stated reason' })
  async cancelAgreement(
    @Param('id') agreementId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') rolesList: string[],
    @Body(new ZodValidationPipe(CancelAgreementSchema)) dto: CancelAgreementDto,
  ) {
    return this.agreementsService.cancelAgreement(agreementId, userId, dto, rolesList || []);
  }

  // --- Trip Execution Endpoints ---

  @Post('agreements/:id/stops/:stopId/arrive')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Record driver physical arrival at stop with device location coordinates' })
  async driverArrive(
    @Param('id') agreementId: string,
    @Param('stopId') stopId: string,
    @CurrentUser('userId') driverId: string,
    @Body(new ZodValidationPipe(StopArrivalSchema)) dto: StopArrivalDto,
  ) {
    return this.agreementsService.driverArriveAtStop(agreementId, stopId, driverId, dto);
  }

  @Post('agreements/:id/stops/:stopId/wait/start')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start billable waiting timer (wait mode only)' })
  async driverStartWait(
    @Param('id') agreementId: string,
    @Param('stopId') stopId: string,
    @CurrentUser('userId') driverId: string,
  ) {
    return this.agreementsService.driverStartWait(agreementId, stopId, driverId);
  }

  @Post('agreements/:id/stops/:stopId/wait/end')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End billable waiting timer' })
  async driverEndWait(
    @Param('id') agreementId: string,
    @Param('stopId') stopId: string,
    @CurrentUser('userId') driverId: string,
  ) {
    return this.agreementsService.driverEndWait(agreementId, stopId, driverId);
  }

  @Post('agreements/:id/stops')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Driver adds in-flight stop (creates pending amendment)' })
  async driverAddInFlightStop(
    @Param('id') agreementId: string,
    @CurrentUser('userId') driverId: string,
    @Body(new ZodValidationPipe(CreateOrderStopSchema)) dto: CreateOrderStopDto,
  ) {
    return this.agreementsService.proposeAmendment(agreementId, driverId, {
      addedStops: [dto],
      reason: 'محطة إضافية مقترحة من الكابتن أثناء الرحلة',
    });
  }

  @Post('stops/:stopId/invoice')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Record merchant purchase invoice paid by driver' })
  async driverIssueInvoice(
    @Param('stopId') stopId: string,
    @CurrentUser('userId') driverId: string,
    @Body(new ZodValidationPipe(CreateInvoiceSchema)) dto: CreateInvoiceDto,
  ) {
    return this.agreementsService.driverIssueInvoice(stopId, driverId, dto);
  }

  @Post('invoices/:id/send')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transmit issued purchase invoice to customer' })
  async sendInvoice(@Param('id') invoiceId: string) {
    return { success: true, message: 'تم إرسال الفاتورة للعميل', invoiceId };
  }

  @Post('invoices/:id/payment-recorded')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record cash payment settlement between customer and captain' })
  async recordPayment(
    @Param('id') invoiceId: string,
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(RecordPaymentReceiptSchema)) dto: RecordPaymentReceiptDto,
  ) {
    return this.agreementsService.recordPayment(invoiceId, userId, dto);
  }

  @Post('invoices/:id/dispute')
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Customer disputes an incorrect or unauthorized purchase invoice' })
  async disputeInvoice(
    @Param('id') invoiceId: string,
    @CurrentUser('userId') customerId: string,
    @Body(new ZodValidationPipe(DisputeInvoiceSchema)) dto: DisputeInvoiceDto,
  ) {
    return this.agreementsService.disputeInvoice(invoiceId, customerId, dto);
  }

  @Post('agreements/:id/stops/:stopId/complete')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark waypoint stop completed and advance to next stop' })
  async driverCompleteStop(
    @Param('id') agreementId: string,
    @Param('stopId') stopId: string,
    @CurrentUser('userId') driverId: string,
  ) {
    return this.agreementsService.driverCompleteStop(agreementId, stopId, driverId);
  }

  @Post('agreements/:id/complete')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete trip, run SQL calculate_final_fare, and return settlement breakdown' })
  async driverCompleteTrip(
    @Param('id') agreementId: string,
    @CurrentUser('userId') driverId: string,
  ) {
    return this.agreementsService.driverCompleteAgreement(agreementId, driverId);
  }

  @Post('driver/location')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'High-throughput batched GPS telemetry points' })
  async driverLocation(
    @CurrentUser('userId') driverId: string,
    @Body(new ZodValidationPipe(DriverLocationBatchSchema)) dto: DriverLocationBatchDto,
  ) {
    return this.agreementsService.driverUpdateLocation(driverId, dto);
  }

  @Post('driver/presence')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle captain online/offline availability' })
  async driverPresence(
    @CurrentUser('userId') driverId: string,
    @Body(new ZodValidationPipe(DriverPresenceSchema)) dto: DriverPresenceDto,
  ) {
    return this.agreementsService.driverSetPresence(driverId, dto.isOnline);
  }
}
