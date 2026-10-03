import { Injectable } from '@nestjs/common';
import { IdentityService } from './identity.service.js';

export interface UserSummary {
  id: string;
  phone?: string | null;
  email?: string | null;
  fullName?: string | null;
  roles: string[];
  permissions: string[];
}

@Injectable()
export class IdentityFacade {
  constructor(private readonly identityService: IdentityService) {}

  async getUserById(userId: string): Promise<UserSummary> {
    return this.identityService.getUserProfile(userId);
  }
}
