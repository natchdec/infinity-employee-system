alter table employee_roles
  drop constraint if exists employee_roles_role_check;

alter table employee_roles
  add constraint employee_roles_role_check
  check (role in ('employee','head','finance','finance_payer','admin'));

-- Finance/Admin Head/Owner is the default final payment authorizer.
-- This is a role, not a separate department, and Admin may reassign it later.
insert into employee_roles(employee_id,role)
select e.id,'finance_payer'
from employees e
where e.active
  and e.is_head_owner
  and exists (
    select 1 from employee_roles er
    where er.employee_id=e.id and er.role='finance'
  )
on conflict do nothing;
