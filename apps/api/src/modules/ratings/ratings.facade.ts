import { Injectable } from '@nestjs/common';

@Injectable()
export class RatingsFacade {
  async getUserAverageRating(_userId: string) {
    return { averageRating: 5.0, count: 0 };
  }
}
