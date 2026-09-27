'use client';

import { useState } from 'react';

type Role = 'employee' | 'head' | 'finance' | 'admin';

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

function EmployeeEditor({
  csrf,
  actorId,
  employee,
  departments,
}: {
  csrf: string;
  actorId: string;
  employee: EmployeeRow;
  departments: DepartmentRow[];
}) {
  const [departmentId, setDepartmentId] = useState(employee.departmentId ?? '');
  const [roles, setRoles] = useState<Role[]>(employee.roles);
  const [isHeadOwner, setIsHeadOwner] = useState(employee.isHeadOwner);
  const [active, setActive] = useState(employee.active);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function toggleRole(role: Role, checked: boolean) {
    if (role === 'employee') return;
    setRoles((current) => {
      const next = new Set(current);
      if (checked) next.add(role);
      else next.delete(role);
      next.add('employee');
      if (isHeadOwner) next.add('head');
      return ['employee', 'head', 'finance', 'admin'].filter((item) =>
        next.has(item as Role),
      ) as Role[];
    });
  }

  function toggleOwner(checked: boolean) {
    setIsHeadOwner(checked);
    if (checked) setRoles((current) => [...new Set<Role>([...current, 'employee', 'head'])]);
  }

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      await post(csrf, `/api/admin/employees/${employee.id}`, {
        expectedRevision: employee.revision,
        departmentId: departmentId || null,
        roles,
        isHeadOwner,
        active,
      });
      setMessage('บันทึกแล้ว');
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  const self = actorId === employee.id;

  return (
    <div className="admin-employee-card">
      <div className="admin-card-heading">
        <div>
          <strong>{employee.displayName}</strong>
          <span>{employee.email}</span>
        </div>
        <span className={active ? 'state state-success' : 'state state-neutral'}>
          {active ? 'ใช้งาน' : 'ปิดใช้งาน'}
        </span>
      </div>

      <div className="admin-form-grid">
        <label>
          <span>แผนก</span>
          <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="">ยังไม่กำหนด</option>
            {departments
              .filter((item) => item.active || item.id === employee.departmentId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.code})
                </option>
              ))}
          </select>
        </label>
        <div>
          <span className="field-label">Reporting Line ปัจจุบัน</span>
          <p className="field-value">
            {employee.headName ?? (isHeadOwner ? 'SYSTEM_SKIPPED' : 'ยังไม่กำหนด')}
          </p>
        </div>
      </div>

      <fieldset className="admin-role-fieldset">
        <legend>Roles</legend>
        <div className="role-checks">
          {(['employee', 'head', 'finance', 'admin'] as Role[]).map((role) => (
            <label className="check-field" key={role}>
              <input
                type="checkbox"
                checked={role === 'employee' || roles.includes(role)}
                disabled={role === 'employee' || (self && role === 'admin')}
                onChange={(event) => toggleRole(role, event.target.checked)}
              />
              <span>{role[0]!.toUpperCase() + role.slice(1)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="admin-inline-controls">
        <label className="check-field">
          <input
            type="checkbox"
            checked={isHeadOwner}
            onChange={(event) => toggleOwner(event.target.checked)}
          />
          <span>Head / Owner — คำขอของตนเองข้าม Manager approval</span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={active}
            disabled={self}
            onChange={(event) => setActive(event.target.checked)}
          />
          <span>บัญชีเปิดใช้งาน</span>
        </label>
      </div>

      <div className="admin-card-actions">
        <button className="button button-primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'กำลังบันทึก…' : 'บันทึกสิทธิ์'}
        </button>
        {message ? (
          <span className="field-note" role="status">
            {message}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function EmployeeAdminClient({
  csrf,
  actorId,
  employees,
  departments,
}: {
  csrf: string;
  actorId: string;
  employees: EmployeeRow[];
  departments: DepartmentRow[];
}) {
  return (
    <div className="admin-card-list">
      {employees.map((employee) => (
        <EmployeeEditor
          key={employee.id}
          csrf={csrf}
          actorId={actorId}
          employee={employee}
          departments={departments}
        />
      ))}
    </div>
  );
}
