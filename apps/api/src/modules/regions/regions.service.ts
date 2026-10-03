import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { regions } from '../../database/schema/index.js';
import { eq } from 'drizzle-orm';

@Injectable()
export class RegionsService {
  constructor(@Inject(DatabaseService) private readonly dbService: DatabaseService) {}

  async listActiveRegions() {
    return this.dbService.db.select().from(regions).where(eq(regions.isActive, true));
  }

  async getRegionByCode(code: string) {
    const [region] = await this.dbService.db
      .select()
      .from(regions)
      .where(eq(regions.code, code))
      .limit(1);
    return region || null;
  }
}
