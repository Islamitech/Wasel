import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationsFacade {
  async sendSystemNotification(_userId: string, _title: string, _body: string) {
    return true;
  }
}
