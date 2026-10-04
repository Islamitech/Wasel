import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service.js';
import { JwtAuthGuard } from '../identity/index.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Idempotent } from '../../common/decorators/idempotent.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  CreateOrderSchema,
  CreateOrderDto,
  UpdateOrderSchema,
  UpdateOrderDto,
  CreateOrderStopSchema,
  CreateOrderStopDto,
  CancelOrderSchema,
  CancelOrderDto,
  OrderListQuerySchema,
  OrderListQueryDto,
  OrderUploadUrlRequestSchema,
  OrderUploadUrlRequestDto,
  UserRole,
} from '@wasel/shared';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  @Post()
  @Idempotent()
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a draft order with sequential stops cart' })
  async createDraftOrder(
    @CurrentUser('userId') customerId: string,
    @Body(new ZodValidationPipe(CreateOrderSchema)) dto: CreateOrderDto,
  ) {
    return this.ordersService.createDraftOrder(customerId, dto);
  }

  @Get()
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @ApiOperation({ summary: 'List orders placed by current customer' })
  async listOrders(
    @CurrentUser('userId') customerId: string,
    @Query(new ZodValidationPipe(OrderListQuerySchema)) query: OrderListQueryDto,
  ) {
    return this.ordersService.listCustomerOrders(customerId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full order details, stops, and active agreement snapshot' })
  async getOrderDetails(
    @Param('id') orderId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') rolesList: string[],
  ) {
    return this.ordersService.getOrderDetails(orderId, userId, rolesList || []);
  }

  @Patch(':id')
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update order parameters while in draft status' })
  async updateDraftOrder(
    @Param('id') orderId: string,
    @CurrentUser('userId') customerId: string,
    @Body(new ZodValidationPipe(UpdateOrderSchema)) dto: UpdateOrderDto,
  ) {
    return this.ordersService.updateDraftOrder(orderId, customerId, dto);
  }

  @Post(':id/stops')
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Append a new stop task to a draft order' })
  async addStop(
    @Param('id') orderId: string,
    @CurrentUser('userId') customerId: string,
    @Body(new ZodValidationPipe(CreateOrderStopSchema)) dto: CreateOrderStopDto,
  ) {
    return this.ordersService.addStop(orderId, customerId, dto);
  }

  @Delete(':id/stops/:stopId')
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Remove a stop task from a draft order' })
  async deleteStop(
    @Param('id') orderId: string,
    @Param('stopId') stopId: string,
    @CurrentUser('userId') customerId: string,
  ) {
    return this.ordersService.deleteStop(orderId, stopId, customerId);
  }

  @Get(':id/quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Compute minimum guaranteed fare using SQL formula & billable visits' })
  async quoteOrderGet(
    @Param('id') orderId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') rolesList: string[],
  ) {
    return this.ordersService.quoteOrder(orderId, userId, rolesList || []);
  }

  @Post(':id/quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Compute minimum guaranteed fare using SQL formula & billable visits' })
  async quoteOrder(
    @Param('id') orderId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') rolesList: string[],
  ) {
    return this.ordersService.quoteOrder(orderId, userId, rolesList || []);
  }

  @Post(':id/publish')
  @Idempotent()
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Freeze pricing snapshot and publish order for driver dispatch' })
  async publishOrder(
    @Param('id') orderId: string,
    @CurrentUser('userId') customerId: string,
  ) {
    return this.ordersService.publishOrder(orderId, customerId);
  }

  @Post(':id/cancel')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel order with reason' })
  async cancelOrder(
    @Param('id') orderId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') rolesList: string[],
    @Body(new ZodValidationPipe(CancelOrderSchema)) dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(orderId, userId, dto, rolesList || []);
  }

  @Post(':id/media/upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get pre-signed upload URL for order voice notes / photos' })
  async getMediaUploadUrl(
    @Param('id') orderId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') rolesList: string[],
    @Body(new ZodValidationPipe(OrderUploadUrlRequestSchema)) dto: OrderUploadUrlRequestDto,
  ) {
    return this.ordersService.getMediaUploadUrl(orderId, userId, dto, rolesList || []);
  }

  @Get(':id/media/:mediaId/download-url')
  @ApiOperation({ summary: 'Get pre-signed download URL for private order media' })
  async getMediaDownloadUrl(
    @Param('id') orderId: string,
    @Param('mediaId') mediaId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('roles') rolesList: string[],
  ) {
    return this.ordersService.getMediaDownloadUrl(orderId, mediaId, userId, rolesList || []);
  }
}

