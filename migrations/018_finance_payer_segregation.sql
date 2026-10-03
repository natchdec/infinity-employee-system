-- Strengthen segregation of duties for final payment approval without changing department structure.
-- All active Finance users may be designated Finance Payer so one Finance user can pay an item
-- verified by the other, while self-payment and verifier=payer remain forbidden.

insert into employee_roles(employee_id, role)
select e.id, 'finance_payer'
from employees e
where e.active
  and exists (
    select 1
    from employee_roles er
    where er.employee_id = e.id
      and er.role = 'finance'
  )
on conflict do nothing;

create or replace function protect_payment_batch()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'paid' then
    raise exception 'paid_batch_immutable' using errcode = '23514';
  end if;

  if new.status = 'paid' and exists (
    select 1
    from payment_items i
    join payable_obligations o on o.id = i.obligation_id
    where i.batch_id = new.id
      and i.active
      and (
        o.owner_id = new.paid_by
        or o.verified_by = new.paid_by
      )
  ) then
    raise exception 'finance_payment_conflict' using errcode = '23514';
  end if;

  return new;
end;
$$;
