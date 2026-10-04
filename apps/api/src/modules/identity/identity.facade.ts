import { Injectable } from '@nestjs/common';
import { IdentityService } from './identity.service.js';
import { TokenService, AuthenticatedUserPayload } from './token.service.js';

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
  constructor(
    private readonly identityService: IdentityService,
    private readonly tokenService: TokenService,
  ) {}

  async getUserById(userId: string): Promise<UserSummary> {
    return this.identityService.getUserProfile(userId);
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUserPayload> {
    return this.tokenService.verifyAccessToken(token);
  }
}
