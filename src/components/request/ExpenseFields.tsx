'use client';

import { useState } from 'react';
import type { Json } from '@/domain/core';
import type { RequestFormOptions } from '@/server/request-view';
import { arrayValue, objectValue, textValue } from './form-utils';

interface Props {
  options: RequestFormOptions;
  initial: Record<string, Json>;
}

export function ExpenseFields({ options, initial }: Props) {
  const initialLine = objectValue(arrayValue(initial.lines)[0]);
  const mileage = arrayValue(initialLine.mileage).map(objectValue);
  const entertainment = objectValue(initialLine.entertainment);
  const [category, setCategory] = useState(
    textValue(initialLine.categoryId) || options.expenseCategories[0]?.id || 'mileage',
  );
  const [mileageLegCount, setMileageLegCount] = useState(
    Math.min(20, Math.max(2, mileage.length || 2)),
  );

  return (
    <fieldset>
      <legend>รายการค่าใช้จ่าย</legend>
      <div className="form-grid-2">
        <label>
          <span>ประเภท</span>
          <select
            name="categoryId"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {options.expenseCategories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>วันที่</span>
          <input name="date" type="date" required defaultValue={textValue(initialLine.date)} />
        </label>
      </div>

      <label>
        <span>รายละเอียดรายการ</span>
        <input name="lineDescription" required defaultValue={textValue(initialLine.description)} />
      </label>

      <label>
        <span>ทริปที่เกี่ยวข้อง</span>
        <select name="parentTripId" defaultValue={textValue(initial.parentTripId)}>
          <option value="">ไม่ผูกทริป</option>
          {options.approvedTrips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.reference} — {trip.title}
            </option>
          ))}
        </select>
      </label>

      {category === 'mileage' ? (
        <div className="subsection">
          <h3>เที่ยวเดินทาง</h3>
          <input type="hidden" name="mileageLegCount" value={mileageLegCount} />
          {Array.from({ length: mileageLegCount }, (_, offset) => offset + 1).map((index) => {
            const initialLeg = mileage[index - 1] ?? {};
            const routeLeg =
              Boolean(textValue(initialLeg.originLabel)) ||
              Boolean(textValue(initialLeg.destinationLabel));
            const requiredLeg = index === 1 || routeLeg;
            return (
              <div className="mileage-leg" key={index}>
                <strong>เที่ยว {index}</strong>
                <div className="form-grid-2">
                  <label>
                    <span>ต้นทาง</span>
                    <select
                      name={`leg${index}Origin`}
                      defaultValue={
                        textValue(initialLeg.origin) || (index === 1 ? 'home' : 'customer')
                      }
                    >
                      <option value="home">บ้าน</option>
                      <option value="office">สำนักงาน</option>
                      <option value="customer">ลูกค้า</option>
                      <option value="other">อื่น ๆ</option>
                    </select>
                  </label>
                  <label>
                    <span>ปลายทาง</span>
                    <select
                      name={`leg${index}Destination`}
                      defaultValue={
                        textValue(initialLeg.destination) || (index === 1 ? 'customer' : 'home')
                      }
                    >
                      <option value="home">บ้าน</option>
                      <option value="office">สำนักงาน</option>
                      <option value="customer">ลูกค้า</option>
                      <option value="other">อื่น ๆ</option>
                    </select>
                  </label>
                  <label>
                    <span>ชื่อต้นทาง</span>
                    <input
                      name={`leg${index}OriginLabel`}
                      required={requiredLeg}
                      defaultValue={
                        textValue(initialLeg.originLabel) || (index === 1 ? 'บ้าน' : 'ลูกค้า')
                      }
                    />
                  </label>
                  <label>
                    <span>ชื่อปลายทาง</span>
                    <input
                      name={`leg${index}DestinationLabel`}
                      required={requiredLeg}
                      defaultValue={
                        textValue(initialLeg.destinationLabel) || (index === 1 ? 'ลูกค้า' : 'บ้าน')
                      }
                    />
                  </label>
                </div>
                <label>
                  <span>ระยะทาง (กม.){requiredLeg ? '' : ' — ไม่บังคับ'}</span>
                  <input
                    name={`leg${index}Km`}
                    inputMode="decimal"
                    required={requiredLeg}
                    placeholder="55"
                    defaultValue={
                      typeof initialLeg.distanceMetres === 'number'
                        ? String(initialLeg.distanceMetres / 1000)
                        : ''
                    }
                  />
                </label>
              </div>
            );
          })}
          <div className="action-row">
            <button
              className="button button-secondary"
              type="button"
              disabled={mileageLegCount >= 20}
              onClick={() => setMileageLegCount((count) => Math.min(20, count + 1))}
            >
              เพิ่มเที่ยว
            </button>
            <button
              className="button button-quiet"
              type="button"
              disabled={mileageLegCount <= 2}
              onClick={() => setMileageLegCount((count) => Math.max(2, count - 1))}
            >
              ลบเที่ยวสุดท้าย
            </button>
          </div>
          <p className="field-note">
            รองรับสูงสุด 20 เที่ยวต่อรายการ · ระยะทางที่กรอกเองจะแสดงเป็น Employee attested ไม่ใช่
            Google-verified และระบบจะหัก Home → Office ต่อเที่ยวที่เข้าเกณฑ์
          </p>
        </div>
      ) : (
        <label>
          <span>จำนวนเงิน (บาท)</span>
          <input
            name="amount"
            required
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={textValue(initialLine.amount)}
          />
        </label>
      )}

      {category === 'entertainment' ? (
        <div className="subsection">
          <h3>ข้อมูลรับรองลูกค้า</h3>
          <label>
            <span>วัตถุประสงค์ทางธุรกิจ</span>
            <input name="purpose" required defaultValue={textValue(entertainment.purpose)} />
          </label>
          <label>
            <span>ลูกค้า / องค์กร</span>
            <input name="customer" required defaultValue={textValue(entertainment.customer)} />
          </label>
          <div className="form-grid-2">
            <label>
              <span>จำนวนผู้ร่วม</span>
              <input
                name="attendeeCount"
                type="number"
                min={1}
                max={200}
                required
                defaultValue={String(entertainment.attendeeCount ?? 1)}
              />
            </label>
            <label>
              <span>บริบทผู้ร่วม</span>
              <input
                name="attendeeContext"
                required
                defaultValue={textValue(entertainment.attendeeContext)}
              />
            </label>
          </div>
        </div>
      ) : null}

      <p className="field-note">
        {options.expenseCategories.find((item) => item.id === category)?.originalRequired
          ? 'ประเภทนี้ต้องติดตามใบเสร็จต้นฉบับแยกจากสถานะการจ่าย'
          : 'ประเภทนี้ไม่บังคับใบเสร็จต้นฉบับตามนโยบายปัจจุบัน'}
      </p>
    </fieldset>
  );
}
