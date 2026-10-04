'use client';

import { MagnifyingGlass } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';

export interface ProjectSearchOption {
  id: string;
  code: string;
  name: string;
  customer: string | null;
  poNumber: string | null;
  productCategory: string | null;
  productSolution: string | null;
  lineCount: number;
}

interface Props {
  projects: ProjectSearchOption[];
  name?: string;
  required?: boolean;
  defaultValue?: string;
}

function displayLabel(project: ProjectSearchOption): string {
  const lead = project.poNumber ? 'PO ' + project.poNumber : project.code;
  return lead + ' · ' + project.name + (project.customer ? ' · ' + project.customer : '');
}

function searchableText(project: ProjectSearchOption): string {
  return [
    project.code,
    project.name,
    project.customer,
    project.poNumber,
    project.productCategory,
    project.productSolution,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('th-TH');
}

export function ProjectSearchInput({
  projects,
  name = 'projectId',
  required = false,
  defaultValue = '',
}: Props) {
  const initial = projects.find((project) => project.id === defaultValue) ?? null;
  const [selectedId, setSelectedId] = useState(initial?.id ?? '');
  const [query, setQuery] = useState(initial ? displayLabel(initial) : '');
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('th-TH');
    if (!needle || selectedId) return projects.slice(0, 12);
    return projects.filter((project) => searchableText(project).includes(needle)).slice(0, 12);
  }, [projects, query, selectedId]);

  function choose(project: ProjectSearchOption) {
    setSelectedId(project.id);
    setQuery(displayLabel(project));
    setOpen(false);
  }

  return (
    <div className="project-search">
      <input type="hidden" name={name} value={selectedId} />
      <div className="project-search-input">
        <MagnifyingGlass size={17} aria-hidden="true" />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls="project-search-results"
          aria-autocomplete="list"
          required={required}
          value={query}
          placeholder="ค้นหา Project / PO / ลูกค้า / Product..."
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedId('');
            setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        />
      </div>
      {open ? (
        <div className="project-search-results" id="project-search-results" role="listbox">
          {!required ? (
            <button
              type="button"
              role="option"
              aria-selected={!selectedId}
              className="project-search-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setSelectedId('');
                setQuery('');
                setOpen(false);
              }}
            >
              <strong>ไม่ผูกโครงการ</strong>
              <small>สร้างคำขอโดยไม่ผูก Project</small>
            </button>
          ) : null}
          {matches.map((project) => (
            <button
              type="button"
              role="option"
              aria-selected={project.id === selectedId}
              className="project-search-option"
              key={project.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(project)}
            >
              <strong>
                {project.poNumber ? 'PO ' + project.poNumber : project.code} · {project.name}
              </strong>
              <small>
                {[project.customer, project.productCategory, project.productSolution]
                  .filter(Boolean)
                  .join(' · ') || 'ไม่มีข้อมูลลูกค้า/Product'}
                {project.lineCount > 1 ? ' · ' + project.lineCount + ' รายการใน PO นี้' : ''}
              </small>
            </button>
          ))}
          {!matches.length ? (
            <div className="project-search-empty">ไม่พบ Project ที่ตรงกับคำค้น</div>
          ) : null}
        </div>
      ) : null}
      {required && !selectedId ? (
        <p className="field-note">กรุณาเลือก Project จากผลการค้นหาก่อนส่งคำขอ</p>
      ) : null}
    </div>
  );
}
