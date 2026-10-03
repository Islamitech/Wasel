import { SetMetadata } from '@nestjs/common';

export const AUDIT_METADATA_KEY = 'AUDIT_METADATA_KEY';

export interface AuditMetadata {
  action: string;
  entityType: string;
}

export const Audit = (action: string, entityType: string) =>
  SetMetadata(AUDIT_METADATA_KEY, { action, entityType });
