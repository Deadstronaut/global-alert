select id, email, created_at, confirmed_at, email_confirmed_at
from auth.users
order by created_at desc
limit 10;

select id, user_id, provider, email, created_at
from auth.identities
order by created_at desc
limit 10;
