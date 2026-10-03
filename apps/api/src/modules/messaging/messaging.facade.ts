import { Injectable } from '@nestjs/common';

@Injectable()
export class MessagingFacade {
  async getUnreadCount(_userId: string) {
    return 0;
  }
}
