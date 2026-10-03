import { Injectable, Logger } from '@nestjs/common';

/**
 * Reserved WebSocket Gateway skeleton for future realtime location/order tracking
 */
@Injectable()
export class RealtimeGateway {
  private readonly logger = new Logger(RealtimeGateway.name);

  handleConnection(client: any) {
    this.logger.debug(`Client connected: ${client?.id || 'socket'}`);
  }

  handleDisconnect(client: any) {
    this.logger.debug(`Client disconnected: ${client?.id || 'socket'}`);
  }
}
