export const EASY_ACC_DIRECT_INTEGRATION_BLOCKED_REASON =
  'EASY-ACC direct integration is disabled until Business Soft provides a sanctioned API or bridge contract. File import (PRIMPORT/CSV/helper importer) and direct database writes are prohibited by product decision.';

export const EASY_ACC_INTEGRATION_POLICY = {
  transport: 'vendor_api_or_bridge_only',
  fileImportAllowed: false,
  directDatabaseWriteAllowed: false,
} as const;
