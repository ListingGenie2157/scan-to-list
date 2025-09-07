-- Schedule daily preparation of listing drafts using pg_cron
-- This will run every day at 9 AM UTC to create listing drafts
SELECT cron.schedule(
    'prepare-daily-drafts',
    '0 9 * * *', -- Every day at 9 AM UTC
    $$
    SELECT
      net.http_post(
          url:='https://yfynlpwzrxoxcwntigjv.supabase.co/functions/v1/prepare-daily-drafts',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmeW5scHd6cnhveGN3bnRpZ2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNTY3OTIsImV4cCI6MjA2OTkzMjc5Mn0.bUw5LbFzK4pQc7I83S_lthA0IyqruEPS-_gfOwy3zV4"}'::jsonb,
          body:='{"source": "cron"}'::jsonb
      ) as request_id;
    $$
);