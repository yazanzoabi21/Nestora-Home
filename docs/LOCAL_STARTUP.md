# Local development

From the repository root:

```powershell
npm ci
npm start
```

Open **http://localhost:4300/**. `npm start` runs the normal Angular CLI development server. Angular connects directly to the configured Supabase project through the official JavaScript SDK. No local API server, proxy, Redis service, server environment file, or port 3000 is required.

Use `npm run build` for production output and `npm run test -- --watch=false` for unit tests. In PowerShell, `node node_modules/@angular/cli/bin/ng.js test --watch=false` also avoids npm argument-forwarding differences.

Only the existing Supabase publishable key and HTTPS project URL belong in the Angular environment. Never put service-role credentials or server secrets in the frontend.

Admin and Customer clients use separate auth storage keys. Remember Me chooses local storage; disabling it chooses session storage. The SDK restores sessions and refreshes expired credentials. Guest offers use an independent anonymous client, so they cannot inherit an Admin session. Existing catalogue caching and direct Supabase Realtime remain enabled.

Customer OAuth/email callbacks use `/auth/customer-callback`, and password recovery uses `/auth/customer-reset-password`. These addresses must be allowed in the Supabase project's redirect configuration for each deployed origin. Existing recovery links issued by a removed intermediary cannot be exchanged by the direct SDK; request a fresh link.

Database RLS, function grants, active-role checks and Storage policies remain the authorization boundary. Existing SQL migrations and manual security proposals were preserved unchanged. Privileged order/inventory/loyalty operations continue to execute in existing database RPCs, not in Angular.
