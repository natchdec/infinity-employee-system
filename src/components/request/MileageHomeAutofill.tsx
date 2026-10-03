'use client';

import { useEffect } from 'react';

export function MileageHomeAutofill({ homeAddress }: { homeAddress: string | null }) {
  useEffect(() => {
    const configuredHomeAddress = homeAddress;
    if (!configuredHomeAddress) return;

    function fill(select: HTMLSelectElement) {
      if (select.value !== 'home') return;
      const match = select.name.match(/^(expenseLine\d+Leg\d+)(Origin|Destination)$/);
      if (!match) return;
      const input = document.querySelector<HTMLInputElement>(
        `input[name="${match[1]}${match[2]}Label"]`,
      );
      if (input && input.value.trim() === '') {
        input.value = configuredHomeAddress ?? '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    const form = document.querySelector<HTMLFormElement>('form.request-form');
    if (!form) return;

    const selects = Array.from(
      form.querySelectorAll<HTMLSelectElement>(
        'select[name^="expenseLine"][name$="Origin"], select[name^="expenseLine"][name$="Destination"]',
      ),
    );
    selects.forEach(fill);

    const onChange = (event: Event) => {
      if (event.target instanceof HTMLSelectElement) fill(event.target);
    };
    form.addEventListener('change', onChange);
    return () => form.removeEventListener('change', onChange);
  }, [homeAddress]);

  if (homeAddress) return null;
  return (
    <div className="notice">
      <p>
        ยังไม่ได้ตั้ง Home Address สำหรับ Mileage — <a href="/profile">ตั้งค่าในโปรไฟล์</a>
      </p>
    </div>
  );
}
