import { db } from './db';

export interface PolicyCenterRow {
  family: string;
  version: number;
  effectiveFrom: string;
  status: 'draft' | 'published';
  hash: string;
  createdAt: Date;
  publishedAt: Date | null;
}

export async function policyCenterRows(): Promise<PolicyCenterRow[]> {
  const rows = await db()`
    select family, version, effective_from::text, status, body_hash, created_at, published_at
    from policy_versions
    order by family, effective_from desc, version desc
  `;
  return rows.map((row) => ({
    family: String(row.family),
    version: Number(row.version),
    effectiveFrom: String(row.effective_from),
    status: row.status as PolicyCenterRow['status'],
    hash: String(row.body_hash),
    createdAt: new Date(row.created_at),
    publishedAt: row.published_at ? new Date(row.published_at) : null,
  }));
}
