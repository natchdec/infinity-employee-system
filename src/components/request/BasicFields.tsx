import type { Json } from '@/domain/core';
import type { RequestKind } from '@/domain/requests';
import type { RequestFormOptions } from '@/server/request-view';
import { arrayValue, objectValue, textValue } from './form-utils';

interface Props {
  kind: RequestKind;
  options: RequestFormOptions;
  initial: Record<string, Json>;
}

export function BasicRequestFields({ kind, options, initial }: Props) {
  const projectVisible = kind !== 'leave' && kind !== 'advance';
  return (
    <fieldset>
      <legend>รายละเอียดคำขอ</legend>
      <label>
        <span>เรื่อง</span>
        <input name="title" required maxLength={200} defaultValue={textValue(initial.title)} />
      </label>
      <label>
        <span>รายละเอียดงาน / เหตุผล</span>
        <textarea
          name="description"
          required
          rows={4}
          defaultValue={textValue(initial.description)}
        />
      </label>
      {projectVisible ? (
        <label>
          <span>โครงการ{kind === 'trip' ? ' *' : ''}</span>
          <select
            name="projectId"
            required={kind === 'trip'}
            defaultValue={textValue(initial.projectId)}
          >
            <option value="">ไม่ผูกโครงการ</option>
            {options.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.poNumber ? `PO ${project.poNumber} · ` : ''}
                {project.code} — {project.name}
                {project.lineCount > 1 ? ` · ${project.lineCount} รายการ` : ''}
                {project.customer ? ` · ${project.customer}` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </fieldset>
  );
}

export function LeaveFields({ options, initial }: Omit<Props, 'kind'>) {
  return (
    <fieldset>
      <legend>วันลา</legend>
      <label>
        <span>ประเภทลา</span>
        <select
          name="typeId"
          required
          defaultValue={textValue(initial.typeId) || options.leaveTypes[0]?.id}
        >
          {options.leaveTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid-2">
        <label>
          <span>วันที่เริ่ม</span>
          <input type="date" name="start" required defaultValue={textValue(initial.start)} />
        </label>
        <label>
          <span>วันที่สิ้นสุด</span>
          <input type="date" name="end" required defaultValue={textValue(initial.end)} />
        </label>
      </div>
      <label>
        <span>เหตุการณ์อ้างอิง (กรณีสิทธิ์แบบต่อเหตุการณ์)</span>
        <input name="eventReference" defaultValue={textValue(initial.eventReference)} />
      </label>
    </fieldset>
  );
}

export function OTFields({ options, initial }: Omit<Props, 'kind'>) {
  const map = new Map<string, number>();
  const suggestedHours =
    typeof initial.calendarSuggestedHours === 'number' ? initial.calendarSuggestedHours : 0;
  const calendarDayKind = textValue(initial.calendarDayKind);
  const calendarCategories = options.otCategories.filter(
    (category) => category.dayKind === calendarDayKind,
  );
  const suggestedCategoryId = calendarCategories.length === 1 ? calendarCategories[0]!.id : null;
  for (const item of arrayValue(initial.lines)) {
    const line = objectValue(item);
    if (typeof line.categoryId === 'string' && typeof line.hours === 'number') {
      map.set(line.categoryId, line.hours);
    }
  }
  return (
    <fieldset>
      <legend>OT</legend>
      <div className="form-grid-2">
        <label>
          <span>วันที่ทำ OT</span>
          <input type="date" name="date" required defaultValue={textValue(initial.date)} />
        </label>
        <label>
          <span>Task / งาน</span>
          <input name="task" required defaultValue={textValue(initial.task)} />
        </label>
      </div>
      <div className="ot-grid">
        {options.otCategories.map((category) => (
          <label key={category.id}>
            <span>
              {category.label} ({(category.multiplierBasisPoints / 10000).toFixed(1)}x)
            </span>
            <input
              type="number"
              name={`ot_${category.id}`}
              min={0}
              max={24}
              step={0.5}
              inputMode="decimal"
              defaultValue={
                map.get(category.id) ??
                (category.id === suggestedCategoryId && suggestedHours >= 0.5 ? suggestedHours : 0)
              }
            />
          </label>
        ))}
      </div>
      {suggestedHours > 0 ? (
        <p className="field-note">
          Outlook แนะนำ {suggestedHours} ชั่วโมง
          {suggestedCategoryId
            ? ' และระบบเติมหมวด OT ที่ตรงกับวันให้อัตโนมัติ กรุณาตรวจสอบก่อนส่ง'
            : ' กรุณาเลือกหมวด OT ที่ถูกต้องก่อนส่ง โดยเฉพาะวันหยุด'}
        </p>
      ) : null}
      <p className="field-note">
        ขั้นต่ำ 0.5 ชั่วโมง และเพิ่มทีละ 0.5 ชั่วโมง ระบบคำนวณยอดจากฐานค่าจ้างและนโยบาย
      </p>
    </fieldset>
  );
}

export function TripFields({ initial }: Pick<Props, 'initial'>) {
  return (
    <fieldset>
      <legend>การเดินทาง</legend>
      <div className="form-grid-2">
        <label>
          <span>วันที่เริ่ม</span>
          <input name="start" type="date" required defaultValue={textValue(initial.start)} />
        </label>
        <label>
          <span>วันที่สิ้นสุด</span>
          <input name="end" type="date" required defaultValue={textValue(initial.end)} />
        </label>
      </div>
      <label>
        <span>ปลายทาง</span>
        <input name="destination" required defaultValue={textValue(initial.destination)} />
      </label>
      <div className="form-grid-2">
        <label>
          <span>ประเภทการเดินทาง</span>
          <select name="region" defaultValue={textValue(initial.region) || 'domestic'}>
            <option value="domestic">ในประเทศ</option>
            <option value="international">ต่างประเทศ</option>
          </select>
        </label>
        <label>
          <span>ค่าใช้จ่ายอื่นโดยประมาณ (บาท)</span>
          <input
            name="estimatedAmount"
            inputMode="decimal"
            defaultValue={textValue(initial.estimatedAmount) || '0'}
          />
        </label>
      </div>
      <label className="check-field">
        <input
          name="requestPerDiem"
          type="checkbox"
          defaultChecked={initial.requestPerDiem !== false}
        />
        <span>ขอเบี้ยเลี้ยงตามนโยบาย</span>
      </label>
    </fieldset>
  );
}

export function AdvanceFields({ options, initial }: Omit<Props, 'kind'>) {
  return (
    <fieldset>
      <legend>เงินทดรอง</legend>
      <label>
        <span>ทริป</span>
        <select name="parentTripId" required defaultValue={textValue(initial.parentTripId)}>
          <option value="">เลือกทริป</option>
          {options.approvedTrips.map((trip) => (
            <option value={trip.id} key={trip.id}>
              {trip.reference} — {trip.title}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid-2">
        <label>
          <span>วันที่ขอ</span>
          <input name="date" type="date" required defaultValue={textValue(initial.date)} />
        </label>
        <label>
          <span>จำนวนเงิน (บาท)</span>
          <input
            name="amount"
            inputMode="decimal"
            required
            defaultValue={textValue(initial.amount)}
          />
        </label>
      </div>
    </fieldset>
  );
}
