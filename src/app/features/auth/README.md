# Customer signup email limits

Supabase returns `over_email_send_rate_limit` when too many authentication emails are requested. Wait for the rate-limit window to reset before retrying. During local development, email confirmation can be temporarily disabled in the Supabase Email provider settings. Production should use a properly configured custom SMTP provider; SMTP credentials must never be placed in Angular environment files.
