import { invariant, money, type Actor, type Json } from '../domain/core';
import { bangkokDate } from '../domain/calendar';
import { calculateMileage } from '../domain/calculations';
import type { ExpensePolicy, MileagePolicy, VersionedPolicy } from '../domain/policy';
import type { RequestInput } from '../domain/requests';
import { policyFor, safeJson, type Transaction } from './db';

type ExpenseInput = Extract<RequestInput, { kind: 'expense' }>;
export async function validateDocuments(
  tx: Transaction,
  actor: Actor,
  ids: readonly string[],
  requestId: string,
  evidenceClass: 'expense' | 'medical' | 'settlement',
): Promise<void> {
  if (!ids.length) return;
  const unique = [...new Set(ids)];
  const documents =
    await tx`select id,owner_id,scan_state,evidence_class,sha256 from documents where id in ${tx(unique)}`;
  invariant(
    documents.length === unique.length &&
      documents.every(
        (doc) =>
          doc.owner_id === actor.id &&
          doc.scan_state === 'clean' &&
          doc.evidence_class === evidenceClass,
      ),
    'DOCUMENT_NOT_AVAILABLE',
    'หลักฐานไม่พร้อมใช้งานหรือไม่ใช่เอกสารของคุณ',
  );
  if (evidenceClass === 'expense') {
    const hashes = documents.map((doc) => doc.sha256);
    const used =
      await tx`select distinct r.reference from document_links l join documents d on d.id=l.document_id join requests r on r.id=l.request_id where d.sha256 in ${tx(hashes)} and r.id<>${requestId} and r.kind='expense' and r.workflow_state in ('pending_head','approved') limit 1`;
    invariant(
      !used.length,
      'DUPLICATE_RECEIPT',
      'หลักฐานนี้ถูกใช้กับคำขออื่นแล้ว กรุณาตรวจสอบก่อนเบิกซ้ำ',
    );
  }
}

export async function prepareExpense(
  tx: Transaction,
  actor: Actor,
  input: ExpenseInput,
  requestId: string,
  now: Date,
) {
  const inputDocumentIds = input.lines.flatMap((line) => line.documentIds);
  invariant(
    new Set(inputDocumentIds).size === inputDocumentIds.length,
    'RECEIPT_LINE_CONFLICT',
    'ใบเสร็จหนึ่งใบใช้ได้กับรายการค่าใช้จ่ายเดียวในคำขอนี้',
  );

  const snapshots: VersionedPolicy[] = [];
  const lines: Record<string, Json>[] = [];
  let total = 0n;
  let maximum: bigint | undefined;
  let originalRequired = false;
  for (const [index, line] of input.lines.entries()) {
    invariant(
      line.date <= bangkokDate(now),
      'FUTURE_EXPENSE_DATE',
      'รายการค่าใช้จ่ายจริงต้องไม่เป็นวันที่ในอนาคต',
    );
    const policy = await policyFor<ExpensePolicy>(tx, 'expense', line.date);
    if (!snapshots.some((item) => item.id === policy.id)) snapshots.push(policy);
    maximum =
      maximum === undefined || BigInt(policy.body.maxClaimSatang) < maximum
        ? BigInt(policy.body.maxClaimSatang)
        : maximum;
    const category = policy.body.categories.find(
      (item) => item.id === line.categoryId && item.enabled,
    );
    invariant(
      category,
      'EXPENSE_CATEGORY_DISABLED',
      'ประเภทค่าใช้จ่ายนี้ไม่เปิดใช้งานในวันที่ระบุ',
    );
    invariant(
      !category.evidenceRequired || line.documentIds.length > 0,
      'RECEIPT_REQUIRED',
      `รายการที่ ${index + 1} ต้องแนบหลักฐานก่อนส่ง`,
    );
    await validateDocuments(tx, actor, line.documentIds, requestId, 'expense');
    let amount: bigint;
    let detail: Json = {};
    if (line.categoryId === 'mileage') {
      invariant(line.mileage?.length, 'MILEAGE_LEGS_REQUIRED', 'ต้องระบุเที่ยวเดินทาง');
      invariant(
        !line.amount,
        'DERIVED_AMOUNT_ONLY',
        'ระบบเป็นผู้คำนวณค่าเดินทาง ไม่รับยอดเงินที่กรอกแทน',
      );
      const rate = await policyFor<MileagePolicy>(tx, 'mileage', line.date);
      if (!snapshots.some((item) => item.id === rate.id)) snapshots.push(rate);
      const needsCommute = line.mileage.some(
        (leg) => leg.origin === 'home' || leg.destination === 'home',
      );
      const [commute] = needsCommute
        ? await tx`
            select id,distance_metres,effective_from::text
            from commute_versions
            where employee_id=${actor.id}
            order by
              case when effective_from<=${line.date}::date then 0 else 1 end,
              case when effective_from<=${line.date}::date then effective_from end desc,
              case when effective_from>${line.date}::date then effective_from end asc
            limit 1
          `
        : [null];
      invariant(
        !needsCommute || commute,
        'COMMUTE_NOT_CONFIGURED',
        'ต้องยืนยันระยะทางบ้านถึงสำนักงานก่อนเบิกเที่ยวที่เกี่ยวข้องกับบ้าน',
      );
      const commuteMetres = commute ? Number(commute.distance_metres) : 0;
      const commuteAppliedRetroactively = commute
        ? String(commute.effective_from) > line.date
        : false;
      const verifiedLegs = [];
      for (const leg of line.mileage) {
        if (leg.source === 'manual_attested') {
          verifiedLegs.push(leg);
          continue;
        }
        invariant(
          leg.providerReference,
          'ROUTE_QUOTE_REQUIRED',
          'ต้องใช้ route quote ที่ระบบตรวจสอบแล้ว',
        );
        const [quote] = await tx`
          select id,employee_id,origin_kind,destination_kind,origin_label,destination_label,
                 distance_metres,retention_confirmed,expires_at,consumed_by_request_id
          from route_quotes
          where id=${leg.providerReference} and provider='google_routes'
          for update
        `;
        invariant(
          quote &&
            quote.employee_id === actor.id &&
            quote.retention_confirmed &&
            quote.origin_kind === leg.origin &&
            quote.destination_kind === leg.destination &&
            quote.origin_label === leg.originLabel &&
            quote.destination_label === leg.destinationLabel &&
            (new Date(quote.expires_at) > now || quote.consumed_by_request_id === requestId) &&
            (!quote.consumed_by_request_id || quote.consumed_by_request_id === requestId),
          'ROUTE_QUOTE_INVALID',
          'route quote ไม่ตรงกับรายการ หมดอายุ หรือถูกใช้กับคำขออื่นแล้ว',
          409,
        );
        if (!quote.consumed_by_request_id)
          await tx`
            update route_quotes
            set consumed_by_request_id=${requestId}, consumed_at=${now}
            where id=${quote.id} and consumed_by_request_id is null
          `;
        verifiedLegs.push({
          ...leg,
          distanceMetres: quote.distance_metres,
          providerReference: quote.id,
        });
      }
      const result = calculateMileage(verifiedLegs, commuteMetres, rate.body);
      amount = BigInt(result.totalSatang);
      const providerVerified = verifiedLegs.some((leg) => leg.source === 'google_routes');
      detail = safeJson({
        ...result,
        commuteVersionId: commute?.id ?? null,
        commuteAppliedRetroactively,
        recordedAt: now.toISOString(),
        attestation: providerVerified ? 'server_verified_route' : 'employee_manual',
        providerVerified,
      });
    } else {
      invariant(line.amount !== undefined, 'AMOUNT_REQUIRED', 'ระบุจำนวนเงินค่าใช้จ่าย');
      amount = money(line.amount);
      invariant(
        !line.mileage,
        'UNEXPECTED_MILEAGE_DETAIL',
        'ข้อมูลเที่ยวเดินทางใช้เฉพาะประเภทรถส่วนตัว',
      );
      if (line.categoryId === 'entertainment') {
        invariant(
          line.entertainment,
          'ENTERTAINMENT_CONTEXT_REQUIRED',
          'ระบุวัตถุประสงค์ ลูกค้า และผู้ร่วมรับรอง',
        );
        detail = safeJson(line.entertainment);
      } else
        invariant(
          !line.entertainment,
          'UNEXPECTED_ENTERTAINMENT_DETAIL',
          'ข้อมูลรับรองลูกค้าไม่ตรงกับประเภทค่าใช้จ่าย',
        );
    }
    invariant(amount > 0n, 'POSITIVE_EXPENSE_REQUIRED', 'ยอดเบิกแต่ละรายการต้องมากกว่าศูนย์');
    total += amount;
    originalRequired ||= category.originalRequired;
    lines.push({
      line: index + 1,
      date: line.date,
      categoryId: line.categoryId,
      categoryLabel: category.label,
      description: line.description,
      amountSatang: amount.toString(),
      documentIds: line.documentIds,
      originalRequired: category.originalRequired,
      detail,
    });
  }
  invariant(
    maximum !== undefined && total <= maximum,
    'CLAIM_POLICY_LIMIT',
    'ยอดเบิกรวมเกินเพดานนโยบาย',
  );
  return {
    calculation: { lines, totalSatang: total.toString(), originalRequired } as Record<string, Json>,
    totalSatang: total.toString(),
    snapshots,
    originalRequired,
  };
}
