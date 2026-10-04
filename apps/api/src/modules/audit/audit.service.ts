import { Injectable, Logger, Inject } from '@nestjs/common';
import { DatabaseService, type DatabaseTransaction } from '../../database/database.service.js';
import { auditLogs } from '../../database/schema/index.js';

export interface RecordAuditOptions {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(DatabaseService) private readonly dbService: DatabaseService) {}

  async log(options: RecordAuditOptions, tx?: DatabaseTransaction): Promise<void> {
    try {
      const dbClient = tx || this.dbService.db;
      await dbClient.insert(auditLogs).values({
        userId: options.userId,
        action: options.action,
        entityType: options.entityType,
        entityId: options.entityId,
        beforeState: options.beforeState,
        afterState: options.afterState,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
      });
      this.logger.log(`Audit recorded: [${options.action}] ${options.entityType}:${options.entityId || '*'}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to record audit log: ${msg}`);
    }
  }
}
