import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminFacade {
  async getAdminStats() {
    return { active: true };
  }
}
