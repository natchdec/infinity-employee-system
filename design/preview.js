import {employeeViews} from './employee-views.js';
import {travelViews} from './travel-views.js';
import {operationsViews} from './operations-views.js';
const views={...employeeViews,...travelViews,...operationsViews};
const labels={home:'หน้าแรก',leave:'ขอลา',ot:'บันทึก OT',expense:'เบิกค่าใช้จ่าย',mileage:'ค่าเดินทางรถส่วนตัว',trip:'การเดินทาง',settlement:'เคลียร์ค่าใช้จ่าย',approval:'ตรวจคำขอ',finance:'งานการเงิน',payment:'ชุดการจ่าย',policy:'นโยบาย',signin:'เข้าสู่ระบบ',empty:'สถานะว่าง',error:'ข้อผิดพลาด',offline:'ออฟไลน์'};
const requested=new URLSearchParams(location.search).get('screen');
const screen=Object.hasOwn(views,requested)?requested:'home';
const nav=[['home','หน้าแรก'],['empty','รายการของฉัน'],['expense','สร้างคำขอ'],['trip','การเดินทาง'],['approval','รออนุมัติ'],['finance','งานการเงิน'],['policy','จัดการระบบ']];
document.querySelector('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div><div class="wordmark">INFINITY<span>.</span></div><div class="brand-caption">ระบบพนักงาน</div></div><nav class="nav-group" aria-label="เมนูหลัก">${nav.map(n=>`<a href="?screen=${n[0]}" ${screen===n[0]?'aria-current="page"':''}>${n[1]}</a>`).join('')}</nav><div class="sidebar-bottom">Infinity Solution Service<br>ข้อมูลสำหรับตรวจแบบเท่านั้น</div></aside><div class="work-area"><header class="topbar"><span class="context">ระบบพนักงาน</span><div class="identity"><select id="screen-picker" class="screen-picker" aria-label="เลือกหน้าสำหรับตรวจแบบ">${Object.entries(labels).map(([key,value])=>`<option value="${key}" ${screen===key?'selected':''}>${value}</option>`).join('')}</select><span class="avatar" aria-label="ผู้ใช้ตัวอย่าง">ก</span></div></header><main class="main" id="content">${views[screen]()}</main></div></div><nav class="mobile-nav" aria-label="เมนูมือถือ">${[['home','หน้าแรก'],['empty','รายการ'],['expense','สร้างคำขอ'],['trip','เดินทาง'],['signin','โปรไฟล์']].map(n=>`<a href="?screen=${n[0]}" ${screen===n[0]?'aria-current="page"':''}>${n[1]}</a>`).join('')}</nav>`;
document.querySelector('#screen-picker').addEventListener('change',event=>{location.search=`screen=${event.target.value}`;});
function review(message){document.querySelector('#dialog-body').textContent=message;document.querySelector('#review-dialog').showModal();}
document.querySelector('#request-form')?.addEventListener('submit',event=>{event.preventDefault();review('ตรวจสรุปและผู้รับผิดชอบก่อนยืนยัน ไม่มีข้อมูลถูกส่งจากแบบจำลองนี้');});
document.querySelectorAll('[data-review]').forEach(el=>el.addEventListener('click',()=>review('ตัวอย่างการยืนยัน ยังไม่ได้ทำรายการจริง')));
document.querySelector('[data-draft]')?.addEventListener('click',()=>review('การบันทึกร่างจริงจะเกิดบนเซิร์ฟเวอร์หลังเชื่อมต่อระบบงาน'));
document.querySelectorAll('input[type=file]').forEach(el=>el.addEventListener('change',()=>{const target=document.querySelector('#file-status');if(target)target.textContent=el.files?.[0]?.name?'เลือกไฟล์แล้ว: '+el.files[0].name:'';}));
document.querySelector('#search')?.addEventListener('input',event=>document.querySelectorAll('tbody tr').forEach(row=>{row.hidden=!row.textContent.toLowerCase().includes(event.target.value.toLowerCase());}));
document.querySelector('#clear-filter')?.addEventListener('click',()=>{const input=document.querySelector('#search');input.value='';input.dispatchEvent(new Event('input'));});
