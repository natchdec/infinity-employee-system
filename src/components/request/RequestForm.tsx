'use client';

import {
  AirplaneTilt,
  CalendarCheck,
  ClockCountdown,
  Receipt,
  Wallet,
} from '@phosphor-icons/react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Json } from '@/domain/core';
import type { RequestKind } from '@/domain/requests';
import type { RequestFormOptions } from '@/server/request-view';
import {
  AdvanceFields,
  BasicRequestFields,
  LeaveFields,
  OTFields,
  TripFields,
} from './BasicFields';
import { DocumentUploader, type UploadedDocument } from './DocumentUploader';
import { ExpenseFields } from './ExpenseFields';
import { MileageHomeAutofill } from './MileageHomeAutofill';
import { buildRequestInput, initialDocumentIds } from './form-utils';

interface Props {
  kind: RequestKind;
  csrf: string;
  options: RequestFormOptions;
  mode?: 'create' | 'resubmit';
  requestId?: string;
  expectedRevision?: number;
  initial?: Record<string, Json>;
  sourceWorklogId?: string;
  sourceWorklogRevision?: number;
  sourceWorklogs?: { id: string; expectedRevision: number }[];
}

const kindMeta: Record<RequestKind, { title: string; description: string; icon: ReactNode }> = {
  leave: {
    title: 'คำขอลา',
    description: 'เลือกประเภทลาและวันลา ระบบตรวจนโยบายที่มีผลให้ตามข้อมูลจริง',
    icon: <CalendarCheck size={24} weight="duotone" />,
  },
  ot: {
    title: 'คำขอ OT',
    description: 'กรอกวันที่ งาน และชั่วโมง OT ทีละ 0.5 ชั่วโมงตามหมวดที่ใช้จริง',
    icon: <ClockCountdown size={24} weight="duotone" />,
  },
  expense: {
    title: 'คำขอค่าใช้จ่าย / ค่ารถ',
    description: 'เพิ่มค่าใช้จ่ายได้หลายรายการ เลือกใบเสร็จ และคำนวณ Mileage ผ่าน Google Maps',
    icon: <Receipt size={24} weight="duotone" />,
  },
  trip: {
    title: 'คำขอเดินทางไปปฏิบัติงาน',
    description: 'ระบุช่วงเดินทาง ปลายทาง Project และรายการที่ต้องใช้ระหว่างทริป',
    icon: <AirplaneTilt size={24} weight="duotone" />,
  },
  advance: {
    title: 'คำขอเงินทดรอง',
    description: 'เลือกทริปที่อนุมัติแล้วและระบุจำนวนเงินทดรองที่ต้องใช้',
    icon: <Wallet size={24} weight="duotone" />,
  },
};

export function RequestForm({
  kind,
  csrf,
  options,
  mode = 'create',
  requestId,
  expectedRevision,
  initial = {},
  sourceWorklogId,
  sourceWorklogRevision,
  sourceWorklogs,
}: Props) {
  const router = useRouter();
  const [documents, setDocuments] = useState<UploadedDocument[]>(
    kind === 'leave'
      ? initialDocumentIds(kind, initial).map((id, index) => ({
          id,
          name: `หลักฐานเดิม ${index + 1}`,
        }))
      : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const meta = kindMeta[kind];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const input = buildRequestInput(
        kind,
        new FormData(event.currentTarget),
        options,
        documents.map((document) => document.id),
      );

      if (kind === 'expense') {
        const lines = Array.isArray(input.lines) ? input.lines : [];
        const missingEvidence = lines.flatMap((value, index) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
          const line = value as Record<string, unknown>;
          const category =
            typeof line.categoryId === 'string'
              ? options.expenseCategories.find((item) => item.id === line.categoryId)
              : undefined;
          const lineDocuments = Array.isArray(line.documentIds) ? line.documentIds : [];
          return category?.evidenceRequired && lineDocuments.length === 0 ? [index + 1] : [];
        });
        if (missingEvidence.length)
          throw new Error(
            `รายการที่ ${missingEvidence.join(', ')} ต้องเลือกหรืออัปโหลดหลักฐานก่อนส่ง`,
          );
      }

      const url =
        mode === 'resubmit' && requestId ? `/api/requests/${requestId}/commands` : '/api/requests';
      const worklogSources = sourceWorklogs?.length
        ? sourceWorklogs
        : sourceWorklogId && sourceWorklogRevision
          ? [{ id: sourceWorklogId, expectedRevision: sourceWorklogRevision }]
          : [];
      const body =
        mode === 'resubmit'
          ? {
              action: 'resubmit',
              expectedRevision,
              input,
            }
          : worklogSources.length
            ? {
                input,
                sourceWorklogs: worklogSources,
              }
            : input;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        const fields = result?.error?.fields as Record<string, string> | undefined;
        const detail = fields ? Object.values(fields).join(' · ') : '';
        throw new Error(
          [result?.error?.message ?? 'ส่งคำขอไม่สำเร็จ', detail].filter(Boolean).join(' · '),
        );
      }
      router.push(`/requests/${result.request.id}`);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'ส่งคำขอไม่สำเร็จ');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="request-form" data-kind={kind} onSubmit={submit}>
      <div className="request-form-kind-banner">
        <span className="request-form-kind-icon">{meta.icon}</span>
        <span>
          <strong>{meta.title}</strong>
          <small>{meta.description}</small>
        </span>
      </div>

      <div className="request-progress" aria-label="ขั้นตอนการส่งคำขอ">
        <span className="request-progress-step is-active">
          <b>1.</b> ข้อมูล
        </span>
        <span className="request-progress-line" aria-hidden="true" />
        <span className="request-progress-step">
          <b>2.</b> รายละเอียด
        </span>
        <span className="request-progress-line" aria-hidden="true" />
        <span className="request-progress-step">
          <b>3.</b> ตรวจสอบและส่ง
        </span>
      </div>
      {sourceWorklogs?.length || sourceWorklogId ? (
        <div className="notice">
          <p>
            คำขอนี้สร้างจาก Outlook Calendar Draft กรุณาตรวจข้อมูลก่อนส่ง
            ระบบจะยังใช้ขั้นอนุมัติเดิมทุกขั้น
          </p>
        </div>
      ) : null}
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}

      <BasicRequestFields kind={kind} options={options} initial={initial} />
      {kind === 'leave' ? <LeaveFields options={options} initial={initial} /> : null}
      {kind === 'ot' ? <OTFields options={options} initial={initial} /> : null}
      {kind === 'expense' ? (
        <>
          <MileageHomeAutofill homeAddress={options.homeAddress} />
          <ExpenseFields csrf={csrf} options={options} initial={initial} />
        </>
      ) : null}
      {kind === 'trip' ? <TripFields initial={initial} /> : null}
      {kind === 'advance' ? <AdvanceFields options={options} initial={initial} /> : null}

      {kind === 'leave' ? (
        <DocumentUploader
          csrf={csrf}
          evidenceClass="medical"
          documents={documents}
          onChange={setDocuments}
        />
      ) : null}

      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? 'กำลังส่ง…' : mode === 'resubmit' ? 'ส่งใหม่' : 'ส่งคำขอ'}
        </button>
      </div>
    </form>
  );
}
