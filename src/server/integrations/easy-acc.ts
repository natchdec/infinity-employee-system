import { invariant } from '../../domain/core';

export interface EasyAccPrimportRow {
  employeeCode: string;
  workDays: string;
  ot1Hours: string;
  ot2Hours: string;
  ot3Hours: string;
  ot4Hours: string;
}
const quantity = /^(?:0|[1-9]\d{0,2})(?:\.\d{1,3})?$/;

function normalizedQuantity(value: string): string {
  invariant(quantity.test(value), 'EASY_ACC_QUANTITY_INVALID', 'ค่า Easy-ACC ต้องไม่เกิน 999.999');
  const [whole, fraction = ''] = value.split('.');
  return `${whole}.${fraction.padEnd(3, '0')}`;
}

export function formatEasyAccPrimport(rows: readonly EasyAccPrimportRow[]): string {
  invariant(rows.length > 0, 'EASY_ACC_EMPTY', 'ไม่มีข้อมูลสำหรับส่งออก Easy-ACC');
  return (
    rows
      .map((row) => {
        invariant(
          /^\d{1,10}$/.test(row.employeeCode),
          'EASY_ACC_EMPLOYEE_CODE_INVALID',
          'รหัสพนักงาน Easy-ACC ต้องเป็นตัวเลขไม่เกิน 10 หลัก',
        );
        return [
          row.employeeCode,
          normalizedQuantity(row.workDays),
          normalizedQuantity(row.ot1Hours),
          normalizedQuantity(row.ot2Hours),
          normalizedQuantity(row.ot3Hours),
          normalizedQuantity(row.ot4Hours),
        ].join(' ');
      })
      .join('\r\n') + '\r\n'
  );
}

export function aggregateEasyAccOt(
  lines: readonly { categoryId: string; hours: number }[],
  slotByCategory: Readonly<Record<string, 1 | 2 | 3 | 4>>,
): [number, number, number, number] {
  const totals: [number, number, number, number] = [0, 0, 0, 0];
  for (const line of lines) {
    invariant(
      Number.isSafeInteger(line.hours) && line.hours >= 0,
      'EASY_ACC_OT_HOURS_INVALID',
      'ชั่วโมง OT สำหรับ Easy-ACC ไม่ถูกต้อง',
    );
    const slot = slotByCategory[line.categoryId];
    invariant(
      slot,
      'EASY_ACC_OT_MAPPING_MISSING',
      'ยังไม่ได้แมปประเภท OT ไปยังช่อง OT ของ Easy-ACC',
    );
    totals[slot - 1] = totals[slot - 1]! + line.hours;
  }
  invariant(
    totals.every((value) => value <= 999),
    'EASY_ACC_OT_LIMIT',
    'ชั่วโมง OT เกินขอบเขตไฟล์ Easy-ACC',
  );
  return totals;
}

export const EASY_ACC_PRIMPORT_BLOCKED_REASON =
  'ยืนยันรูปแบบ PRIMPORT.TXT แล้ว แต่ยังต้องยืนยันรหัสพนักงาน จำนวนวันทำงาน และการแมปประเภท OT 1-4 กับฐาน Easy-ACC จริงก่อนเปิดใช้';
