'use client';

import { useMemo, useState, type FormEvent } from 'react';

type Role = 'employee' | 'head' | 'finance' | 'finance_payer' | 'admin';

interface EmployeeRow {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
  isHeadOwner: boolean;
  revision: number;
  departmentId: string | null;
  departmentName: string | null;
  roles: Role[];
  headId: string | null;
  headName: string | null;
}

interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
  activeEmployees: number;
}

async function post(csrf: string, url: string, body: unknown) {
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
  if (!response.ok) throw new Error(result?.error?.message ?? 'บันทึกข้อมูลไม่สำเร็จ');
  return result;
}

function DepartmentEditor({ csrf, department }: { csrf: string; department: DepartmentRow }) {
  const [name, setName] = useState(department.name);
  const [active, setActive] = useState(department.active);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      await post(csrf, '/api/admin/departments', {
        action: 'update',
        id: department.id,
        name,
        active,
      });
      setMessage('บันทึกแล้ว');
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกแผนกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (department.activeEmployees > 0) {
      setMessage('ย้ายพนักงานที่ยังใช้งานอยู่ออกจากแผนกนี้ก่อนลบ');
      return;
    }
    if (!window.confirm(`ลบแผนก ${department.name} (${department.code}) ใช่หรือไม่?`)) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/departments/${department.id}`, {
        method: 'DELETE',
        headers: {
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? 'ลบแผนกไม่สำเร็จ');
      setMessage('ลบแผนกแล้ว');
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ลบแผนกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="department-row">
      <code>{department.code}</code>
      <input
        aria-label={`ชื่อแผนก ${department.code}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <span>{department.activeEmployees} คน</span>
      <label className="check-field">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        <span>เปิดใช้</span>
      </label>
      <button className="button button-secondary" disabled={busy} onClick={() => void save()}>
        บันทึก
      </button>
      <button
        className="button button-quiet"
        disabled={busy || department.activeEmployees > 0}
        title={
          department.activeEmployees > 0 ? 'ย้ายพนักงานที่ยังใช้งานอยู่ออกจากแผนกก่อนลบ' : 'ลบแผนก'
        }
        onClick={() => void remove()}
      >
        ลบ
      </button>
      {message ? <span className="field-note">{message}</span> : null}
    </div>
  );
}

function ReportingLineRow({
  employee,
  heads,
  today,
  busy,
  onSave,
}: {
  employee: EmployeeRow;
  heads: EmployeeRow[];
  today: string;
  busy: boolean;
  onSave: (headId: string, effectiveFrom: string) => void;
}) {
  const [headId, setHeadId] = useState(employee.headId ?? '');
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const locked = employee.isHeadOwner;

  return (
    <tr>
      <td>
        <strong>{employee.displayName}</strong>
        <div className="cell-secondary">{employee.email}</div>
      </td>
      <td>{employee.departmentName ?? '—'}</td>
      <td>{locked ? 'SYSTEM_SKIPPED' : (employee.headName ?? 'ยังไม่กำหนด')}</td>
      <td>
        <select
          aria-label={`Head ใหม่ของ ${employee.displayName}`}
          value={locked ? '' : headId}
          disabled={locked}
          onChange={(event) => setHeadId(event.target.value)}
        >
          <option value="">ไม่กำหนด / ปิดสายรายงาน</option>
          {heads
            .filter((head) => head.id !== employee.id)
            .map((head) => (
              <option value={head.id} key={head.id}>
                {head.displayName}
              </option>
            ))}
        </select>
      </td>
      <td>
        <input
          type="date"
          min={today}
          value={effectiveFrom}
          disabled={locked}
          onChange={(event) => setEffectiveFrom(event.target.value)}
        />
      </td>
      <td>
        {locked ? (
          <span className="state state-neutral">Owner / Head</span>
        ) : (
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => onSave(headId, effectiveFrom)}
          >
            บันทึก
          </button>
        )}
      </td>
    </tr>
  );
}

export function OrganizationAdminClient({
  csrf,
  employees,
  departments,
  today,
}: {
  csrf: string;
  employees: EmployeeRow[];
  departments: DepartmentRow[];
  today: string;
}) {
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [departmentMessage, setDepartmentMessage] = useState('');
  const [busy, setBusy] = useState('');
  const heads = useMemo(
    () => employees.filter((item) => item.active && item.roles.includes('head')),
    [employees],
  );

  async function createDepartment(event: FormEvent) {
    event.preventDefault();
    setBusy('department');
    setDepartmentMessage('');
    try {
      await post(csrf, '/api/admin/departments', {
        action: 'create',
        code: newCode.trim().toLowerCase(),
        name: newName.trim(),
      });
      setDepartmentMessage('สร้างแผนกแล้ว');
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      setDepartmentMessage(error instanceof Error ? error.message : 'สร้างแผนกไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  async function setReportingLine(employee: EmployeeRow, headId: string, effectiveFrom: string) {
    setBusy(employee.id);
    try {
      await post(csrf, '/api/admin/reporting-lines', {
        employeeId: employee.id,
        headId: headId || null,
        effectiveFrom,
      });
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'บันทึก Reporting Line ไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <section className="section">
        <div className="section-header">
          <div>
            <h2>แผนก</h2>
            <p>รหัสแผนกคงที่หลังสร้าง ส่วนชื่อและสถานะเปลี่ยนได้โดยมี Audit</p>
          </div>
        </div>

        <form className="admin-create-row" onSubmit={(event) => void createDepartment(event)}>
          <label>
            <span>รหัส</span>
            <input
              value={newCode}
              onChange={(event) => setNewCode(event.target.value)}
              placeholder="engineering"
              required
            />
          </label>
          <label>
            <span>ชื่อแผนก</span>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Engineering"
              required
            />
          </label>
          <button className="button button-primary" disabled={busy === 'department'} type="submit">
            เพิ่มแผนก
          </button>
          {departmentMessage ? <span className="field-note">{departmentMessage}</span> : null}
        </form>

        <div className="department-list">
          {departments.map((department) => (
            <DepartmentEditor key={department.id} csrf={csrf} department={department} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>Reporting Lines</h2>
            <p>มีผลกับคำขอใหม่เท่านั้น รายการที่ส่งแล้วเก็บ Head snapshot เดิมเพื่อ Audit</p>
          </div>
        </div>
        <div className="data-table-wrap" tabIndex={0}>
          <table className="data-table admin-reporting-table">
            <thead>
              <tr>
                <th>พนักงาน</th>
                <th>แผนก</th>
                <th>Head ปัจจุบัน</th>
                <th>Head ใหม่</th>
                <th>มีผลวันที่</th>
                <th>คำสั่ง</th>
              </tr>
            </thead>
            <tbody>
              {employees
                .filter((employee) => employee.active)
                .map((employee) => (
                  <ReportingLineRow
                    key={employee.id}
                    employee={employee}
                    heads={heads}
                    today={today}
                    busy={busy === employee.id}
                    onSave={(headId, effectiveFrom) =>
                      void setReportingLine(employee, headId, effectiveFrom)
                    }
                  />
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
