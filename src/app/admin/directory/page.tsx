import { cookies } from 'next/headers';
import { AppShell, StateLabel } from '@/components/AppShell';
import { AdminSectionNav } from '@/components/AdminConfiguration';
import { DirectorySyncButton } from '@/components/DirectorySyncButton';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { config } from '@/server/config';
import { cookieNames } from '@/server/identity';
import { microsoftDirectoryAdminState } from '@/server/microsoft-directory';

export const dynamic = 'force-dynamic';

function bangkokDateTime(value: Date | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export default async function AdminDirectoryPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'admin');
  const state = await microsoftDirectoryAdminState();
  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';
  const enabled = config().OUTLOOK_CALENDAR_SYNC_ENABLED;

  return (
    <AppShell
      actor={actor}
      title="Microsoft 365 Directory"
      description="ซิงก์บัญชี Microsoft 365 ทั้ง tenant เพื่อผูก identity กับ Employee System โดยไม่เปิดสิทธิ์พนักงานให้อัตโนมัติ"
    >
      <AdminSectionNav />
      <section className="section">
        <div className="metric-row" aria-label="Microsoft 365 directory summary">
          <div className="metric">
            <strong>{state.summary.total}</strong>
            <span>Directory accounts</span>
          </div>
          <div className="metric">
            <strong>{state.summary.enabledMembers}</strong>
            <span>Enabled members</span>
          </div>
          <div className="metric">
            <strong>{state.summary.linked}</strong>
            <span>ผูกกับพนักงานแล้ว</span>
          </div>
          <div className="metric">
            <strong>{state.summary.review}</strong>
            <span>ยังไม่ผูก / ต้องตรวจ</span>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="notice">
          <p>
            ระบบเก็บบัญชี Microsoft 365 ทั้งหมด รวม Guest, service account และ resource account
            แต่จะไม่สร้าง Employee หรือให้สิทธิ์เข้าใช้งานอัตโนมัติ บัญชีพนักงานที่มี Entra Object
            ID ตรงกันจะถูกผูกให้อัตโนมัติ
          </p>
          <p>
            Sync ล่าสุด {bangkokDateTime(state.sync?.lastSuccessAt ?? null)}
            {state.sync?.lastErrorCode ? ' · ล่าสุดพบปัญหา ' + state.sync.lastErrorCode : ''}
          </p>
          <DirectorySyncButton csrf={csrf} enabled={enabled} />
        </div>
      </section>
      <section className="section">
        <div className="section-header">
          <div>
            <h2>บัญชีจาก Microsoft 365</h2>
            <p>ข้อมูลนี้เป็น Directory identity ไม่ใช่ Employee master โดยอัตโนมัติ</p>
          </div>
          <span className="state state-neutral">Guests {state.summary.guests}</span>
        </div>
        {state.accounts.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>บัญชี</th>
                  <th>ประเภท</th>
                  <th>สถานะ</th>
                  <th>Department / Job</th>
                  <th>Employee link</th>
                  <th>Sync</th>
                </tr>
              </thead>
              <tbody>
                {state.accounts.map((account) => (
                  <tr key={account.objectId}>
                    <td>
                      <strong>{account.displayName}</strong>
                      <div className="cell-secondary">
                        {account.email ?? account.userPrincipalName}
                      </div>
                    </td>
                    <td>{account.userType || '-'}</td>
                    <td>
                      <StateLabel
                        value={
                          !account.present
                            ? 'cancelled'
                            : account.accountEnabled
                              ? 'confirmed'
                              : 'cancelled'
                        }
                      />
                    </td>
                    <td>
                      {account.departmentName ?? '-'}
                      {account.jobTitle ? (
                        <div className="cell-secondary">{account.jobTitle}</div>
                      ) : null}
                    </td>
                    <td>
                      {account.linkedEmployeeId ? (
                        <span className="state state-success">
                          {account.linkedEmployeeName ?? 'Linked'}
                        </span>
                      ) : (
                        <span className="state state-warning">ยังไม่ใช่ Employee</span>
                      )}
                    </td>
                    <td>{bangkokDateTime(account.lastSyncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ยังไม่มี Directory snapshot</h2>
            <p>กด Sync Microsoft 365 Now หลังเปิด Graph credential</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
