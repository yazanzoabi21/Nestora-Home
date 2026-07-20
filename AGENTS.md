# Nestora Home Agent Instructions

These instructions apply to all future Codex tasks in this repository.

## Project

- Project name: Nestora Home.
- Framework: Angular 21 application using standalone components.
- Styling: TailwindCSS, PrimeNG, PrimeIcons, and existing project styles.
- Package manager: npm.
- Application source root: `src/`.
- Angular project prefix: `app`.

## Required Engineering Rules

- Use Angular Signals and `computed()` state where appropriate.
- Use `ChangeDetectionStrategy.OnPush` for new or touched components unless there is a clear existing exception.
- Keep TypeScript strict. Never use `any`.
- Use modern Angular template control flow: `@if` and `@for` with proper tracking.
- Keep HTML, TypeScript, and CSS/SCSS in separate files. Do not place HTML templates or CSS strings inside TypeScript files.
- Preserve the existing project architecture and naming conventions.
- Reuse existing components, services, models, state, routes, translations, and utilities before adding new abstractions.
- Do not hardcode products, categories, customer information, prices, counts, or database-backed data.
- Do not create mock data unless the user explicitly requests it.
- Do not duplicate business logic between desktop and mobile experiences.
- Preserve responsive desktop, tablet, and mobile behavior.
- Do not break existing functionality while fixing another issue.
- Inspect existing routes, services, models, and state before changing them.
- Make the smallest professional fix possible.
- Run the Angular build after changes and fix errors introduced by the task.
- At the end of each implementation task, report the root cause, modified files, and build result.

## Existing Commands

- `npm run start` - start the Angular dev server (`ng serve`).
- `npm run build` - production Angular build.
- `npm run watch` - development build in watch mode.
- `npm run test` - Angular unit tests.
- `npm run lint` - Angular ESLint over `src/**/*.ts` and `src/**/*.html`.
- `npm run ng -- <args>` - run Angular CLI commands through npm.

Notes:

- The production build has configured budget warnings in `angular.json`: initial bundle warning at `500kB`, error at `1MB`; component style warning at `4kB`, error at `8kB`.
- If full `npm run lint` fails because of unrelated pre-existing files, also run targeted ESLint on touched files and report both results clearly.

## Folder Structure And Conventions

- `src/app/core/` contains cross-cutting app infrastructure:
  - `guards/`, `interceptors/`, `layouts/`, `services/`, `state/`, `tokens/`, `models/`, `constants/`, `config/`.
- `src/app/data-access/` contains database/API-facing models and services:
  - `models/` for shared data models.
  - `services/` for Supabase-backed and domain data services.
  - domain folders such as `categories/`, `orders/`, `products`, `reviews/`, `uploads/`.
- `src/app/features/` contains feature areas:
  - `customer/`, `admin/`, `auth/`, `super-admin/`.
  - Customer pages, components, models, and services live under `src/app/features/customer/`.
- `src/app/shared/` contains reusable UI, components, utilities, validators, directives, pipes, interfaces, models, and types.
- `src/assets/` contains static assets, translations, products assets, images, icons, avatars, logos, banners, and mock asset exports.
- `public/` contains public static files, app icons, favicon, and manifest assets.
- `supabase/migrations/` contains database migrations. Do not modify database schema or functions for UI-only tasks unless explicitly requested.

## Angular And UI Conventions

- Prefer existing standalone component patterns.
- Keep route-aware behavior in route/page components or existing routing services.
- Keep reusable visual controls in `shared/` or the relevant feature `components/` folder, following current naming.
- Keep customer-facing product logic connected to existing customer services and models.
- Prefer typed inputs/outputs for reusable components.
- Use `takeUntilDestroyed()` for subscriptions when subscriptions are needed.
- Avoid manual subscriptions where signals, computed state, router inputs, or template binding are cleaner.
- Use Tailwind responsive utilities for layout breakpoints when template-only behavior is enough.
- Use a TypeScript breakpoint strategy only when behavior genuinely differs by viewport.
- Preserve desktop layouts when changing mobile/tablet UI.
- Do not hide root causes with fragile CSS if the issue is caused by duplicated rendering, wrong conditions, or misplaced state.

## Data And State Rules

- Use existing services for products, categories, discounts, shopping/cart state, wishlist state, authentication, reviews, and checkout.
- Do not replace service data with static arrays.
- Do not introduce a new global state library.
- Keep UI-only state, such as drawer open/closed or menu open/closed, separate from product/filter/business state.
- Do not maintain separate independent desktop and mobile filter values.
- If a component appears in both desktop and mobile contexts, extract or improve a reusable content component instead of duplicating business markup.

## Styling And Responsiveness

- Match the Nestora Home palette and existing design language:
  - `#6B7D5E`
  - `#718369`
  - `#1f2a1f`
  - `#e8dccf`
  - `#faf8f5`
- Avoid horizontal overflow.
- Keep touch targets large enough on mobile.
- Keep product grids, cards, dialogs, drawers, and controls responsive across mobile, tablet, and desktop.
- Use safe-area padding for full-screen mobile overlays or drawers where needed.
- Keep drawers/modals layered above page content and sticky headers with controlled `z-index`.
- Lock and restore background scroll for mobile dialogs/drawers that overlay page content.

## Validation Expectations

After code changes:

- Run `npm run build`.
- Run `npm run lint` when practical.
- If lint fails because of existing unrelated issues, identify that and run a targeted lint command on modified files when possible.
- Verify TypeScript and Angular template errors are fixed.
- For responsive UI work, check relevant mobile, tablet, and desktop widths when tooling is available.
- Report any validation that could not be completed and why.

## Final Response Expectations

For implementation tasks, include:

- Root cause.
- Concise explanation of the fix.
- Modified files.
- Reusable components or state added/changed.
- Mobile/tablet/desktop responsive decisions, when relevant.
- Build result.
- Lint result, if run.
- Any unresolved issue or validation gap.
