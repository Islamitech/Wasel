import { Injectable } from '@nestjs/common';

@Injectable()
export class OrdersFacade {
  async getOrderSummary(_orderId: string) {
    return null;
  }
}
