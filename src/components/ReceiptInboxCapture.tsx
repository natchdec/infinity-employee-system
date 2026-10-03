'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DocumentUploader, type UploadedDocument } from './request/DocumentUploader';

export function ReceiptInboxCapture({ csrf }: { csrf: string }) {
  const router = useRouter();
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);

  return (
    <div>
      <DocumentUploader
        csrf={csrf}
        evidenceClass="expense"
        documents={documents}
        onChange={(next) => {
          if (next.length > documents.length) {
            setDocuments([]);
            router.refresh();
          } else {
            setDocuments(next);
          }
        }}
      />
      <p className="field-note">
        ไฟล์ที่อัปโหลดจากหน้านี้จะอยู่ใน Receipt Inbox จนกว่าจะเลือกไปผูกกับ Expense
      </p>
    </div>
  );
}
