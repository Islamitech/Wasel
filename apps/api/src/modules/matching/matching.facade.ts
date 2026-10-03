import { Injectable } from '@nestjs/common';

@Injectable()
export class MatchingFacade {
  async findCandidatesForOrder(_orderId: string) {
    return [];
  }
}
