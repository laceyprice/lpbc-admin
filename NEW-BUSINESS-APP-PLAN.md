# Full Setup Guide: Duplicate Business App

## Step 1 — Create Accounts & Gather Credentials (Do This First)

| Service | URL | What You Need | Cost |
|---------|-----|---------------|------|
| **Supabase** | supabase.com | New project - save URL, anon key, service role key | Free tier |
| **Docker Hub** | hub.docker.com | Create repo (e.g., yourusername/newbusiness) | Free |
| **GitHub** | github.com | Create new private repo for code backup | Free |
| **Resend** | resend.com | New account - verify your business domain - save API key | Free (3k emails/mo) |
| **Stripe** | stripe.com | New account for the business - save publishable + secret keys | Free (2.9% per txn) |
| **Domain** | Cloudflare or Namecheap | Register domain, set up DNS | ~$10/yr |
| **Flux** | cloud.runonflux.com | Register app after Docker image is pushed | ~$5/mo |
| **Google Cloud Console** | console.cloud.google.com | New project - enable Calendar API - create OAuth credentials - save client ID, client secret, refresh token | Free |
| **Twilio** (optional) | twilio.com | New account - buy phone number - register A2P 10DLC brand + campaign - save SID, auth token, phone number | ~$1/mo + per SMS |
| **Plaid** (optional) | plaid.com | New account - save client ID + secret - apply for production access | Free sandbox, paid production |

## Step 2 — Have Your Business Info Ready

- Business name
- Owner name
- Phone number
- Email address
- Logo image file (PNG, high resolution)
- Brand colors (primary color, accent color)
- List of services offered
- Business description / tagline
- Address / service area
- About section text (owner bio, company story)

## Step 3 — Give Claude This Prompt

```
I want you to build a full business management web app from scratch. This is based on an existing app architecture I've used before. Here's everything you need:

## BUSINESS INFO
- Business Name: [YOUR BUSINESS NAME]
- Owner Name: [OWNER NAME]
- Phone: [PHONE NUMBER]
- Email: [EMAIL]
- Website Domain: [yourdomain.com]
- Tagline: [e.g., "Your Trusted Plumbing Experts"]
- Service Area: [e.g., "Panama City, FL and surrounding areas"]
- Primary Brand Color: [e.g., #185FA5]
- Accent Color: [e.g., #fde047]
- About / Bio: [Brief description of the business and owner]
- Services Offered: [List your services, e.g., "Drain Cleaning, Pipe Repair, Water Heater Installation, Sewer Line Inspection, Emergency Plumbing, Fixture Installation, Repiping"]

## TECH STACK
- Next.js 14 (App Router) with TypeScript and Tailwind CSS
- Supabase (PostgreSQL database, Auth, Storage)
- Docker (multi-stage build, output: standalone)
- Deployment: RunOnFlux (Docker container host)
- Resend for transactional emails
- Stripe for payment processing
- Google Calendar API for appointment scheduling
- Twilio for SMS notifications (optional - set up later)
- Plaid for bank transaction sync (optional - sandbox initially)

## CREDENTIALS (save these in .env.local)
- NEXT_PUBLIC_SUPABASE_URL=[your supabase url]
- NEXT_PUBLIC_SUPABASE_ANON_KEY=[your anon key]
- SUPABASE_SERVICE_ROLE_KEY=[your service role key]
- NEXT_PUBLIC_APP_URL=https://[yourdomain.com]
- RESEND_API_KEY=[your resend key]
- RESEND_FROM_EMAIL=office@[yourdomain.com]
- ADMIN_EMAIL=[owner email]
- STRIPE_SECRET_KEY=[your stripe secret]
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=[your stripe publishable]
- GOOGLE_CLIENT_ID=[your google client id]
- GOOGLE_CLIENT_SECRET=[your google client secret]
- GOOGLE_REFRESH_TOKEN=[your google refresh token]
- GOOGLE_CALENDAR_ID=[your google calendar email]
- TWILIO_ACCOUNT_SID=[your twilio sid or leave blank]
- TWILIO_AUTH_TOKEN=[your twilio token or leave blank]
- TWILIO_PHONE_NUMBER=[your twilio number or leave blank]
- PLAID_CLIENT_ID=[your plaid client id or leave blank]
- PLAID_SECRET=[your plaid secret or leave blank]
- PLAID_ENV=sandbox

## FEATURES TO BUILD

### Public Website (/)
1. **Navbar** - Logo, business name, nav links (Home, About, Services, Schedule, Contact), "Book Service" CTA button. Sticky on scroll.
2. **Hero Section** - Light blue to white gradient background on desktop, solid light blue on mobile. Headline, tagline, trust badges (Licensed, Insured, 5-Star), CTA buttons (Our Services + Schedule Service), logo display on right side. Subtle animated glow effects.
3. **About Section** - Business story, owner bio, mission statement with professional layout.
4. **Services Section** - Grid of service cards with icons and descriptions for each service listed above.
5. **Schedule Section** - Public form with fields: first name, last name, phone, email, jobsite address, service type dropdown, preferred date, preferred time, notes, property owner fields (conditional - show if "not the owner"), company/billing fields (conditional), SMS consent checkbox (REQUIRED to submit, with legal compliance text). Submits to /api/schedule. Auto-saves customer as contact.
6. **Contact Section** - Contact form (name, email, phone, message), business info display, phone/email links.
7. **Footer** - Business info, quick links, copyright.

### Admin Dashboard (/admin) - Protected by Supabase Auth
8. **Login Page** - Email/password login with styled form.
9. **Admin Layout** - Sidebar nav with links: Dashboard, Schedule Requests, Appointments, Invoices, CRM Contacts, Bookkeeping, Bank Statements. Collapsible on mobile.
10. **Dashboard** - Summary cards (pending requests, upcoming appointments, unpaid invoices, total revenue), recent activity feed.
11. **Schedule Requests** - List all incoming requests with:
    - Status filter tabs (pending, scheduled, declined, all)
    - Search bar (search by name, email, phone, address, company, service type, notes)
    - Expandable detail cards showing all customer info
    - Actions: Schedule Appointment, Create Quote, Create Invoice, Decline (with reason textarea + sends email notification to customer), Delete (with confirmation dialog)
    - Pending count badge
12. **Appointments/Calendar** - Create appointments from schedule requests with AM/PM time slots, Google Calendar integration (create events + send invites), appointment reminders (12hr + 1hr before via email + SMS), status tracking.
13. **Invoices & Quotes** - Full invoice/quote builder with:
    - Customer info (name, email, phone, job address, city, company name)
    - Line items table (description, quantity, unit price, auto-calculated total per line + grand total)
    - Auto-generated sequential numbers: INV-001, INV-002... for invoices, QTE-001, QTE-002... for quotes
    - Status tracking: draft -> sent -> paid (invoices) or draft -> sent -> approved (quotes)
    - Send via email with styled HTML template including: hero image banner, "Hello," greeting, invoice/quote details table, Pay Now button (Stripe link) for invoices, Approve Quote button for quotes, Download PDF link, professional signature with logo
    - Resend button for already-sent invoices/quotes (label shows "Resend" vs "Send")
    - Convert Quote to Invoice button
    - Mark as Paid (invoices) / Mark as Approved (quotes)
    - Upload attachments (checks & receipts) to Supabase Storage bucket
    - Auto-save/upsert customer as contact on send
    - Prefill from schedule requests via URL params (Create Quote/Invoice buttons on schedule requests page pass data)
    - Filter tabs by status + search
14. **CRM Contacts** - Contact list with search, add/edit/delete contacts, CSV import, fields: first_name, last_name, email, phone, address, city, state, zip, company_name, notes, source. Auto-populated from schedule requests and invoice sends.
15. **Bookkeeping** - Image upload for receipts/documents organized by month/year, stored in Supabase Storage bucket, view/delete capability.
16. **Bank Statements** - Plaid integration for bank account linking and transaction sync, transaction list with date/amount/description, categorization.

### API Routes
17. **/api/schedule** - GET (list all, optional status filter), POST (create request + send auto-reply email to customer + send SMS + send admin notification email + auto-save as contact), PATCH (update status), DELETE (remove by id)
18. **/api/appointments** - GET, POST (create + Google Calendar event + confirmation email + SMS), PATCH, reminder query endpoint
19. **/api/reminders** - Cron-triggered GET endpoint: find appointments within 12hr or 1hr, send reminder emails + SMS, mark as sent
20. **/api/invoices** - GET (list, optional filters), POST (create), PATCH (update)
21. **/api/send-invoice** - POST: send styled invoice/quote email via Resend, update status to 'sent', auto-upsert contact
22. **/api/invoice-pdf** - GET: render printable HTML invoice/quote page by invoice_number query param. Shows: bill to section, invoice details, line items table, total, jobsite city below address (no label, aligned with street). Has "Print / Save as PDF" button hidden in print.
23. **/api/approve-quote** - GET: customer-facing endpoint (linked from quote email). Updates quote status to 'approved', shows styled confirmation page to customer. Handles already-approved and not-found cases.
24. **/api/invoice-attachments** - GET (list files for invoice), POST (upload file with doc_type prefix), DELETE (remove file). Uses Supabase Storage 'bookkeeping-images' bucket under invoices/{invoice_id}/ path.
25. **/api/contacts** - GET, POST, PATCH, DELETE for CRM contacts
26. **/api/contact** - POST: public contact form submission, forwards to admin email via Resend
27. **/api/bookkeeping** - GET (list images by month), POST (upload), DELETE (remove). Supabase Storage.
28. **/api/plaid** - POST: create link token, exchange public token, sync transactions
29. **/api/auth** - POST: login/logout with Supabase Auth

### Email Templates (all use Resend, inline CSS, consistent branding)
All emails share a common template: hero image banner at top, content body on light gray background, footer with copyright on dark background.

30. **Schedule Request Auto-Reply** - "Thank You for Reaching Out!" to customer with emergency contact callout box
31. **Schedule Request Admin Notification** - Alert to admin with customer details table + "View in Admin Dashboard" button
32. **Appointment Confirmation** - "Appointment Confirmed!" with date, time, service, address table + reschedule contact info
33. **Appointment Reminder** (12hr) - "Appointment Reminder" with "your appointment is tomorrow"
34. **Appointment Reminder** (1hr) - "Almost Time!" with "your appointment is in 1 hour"
35. **Invoice Email** - "Hello," greeting, description of completed services, invoice details table (number, customer, job address, description, amount due in bold), Pay Now button (Stripe URL), Download PDF link, signature block (owner name, business name, phone, email, logo image)
36. **Quote Email** - Same as invoice but says "Quote" everywhere, "Approve Quote" green button instead of Pay Now, description mentions "future services"
37. **Decline Email** - "Schedule Request Update", professional decline message with optional reason in yellow callout box, contact info for future needs
38. **Contact Form Forward** - "New Contact Message" to admin with sender info and message

### PWA & Meta
39. **manifest.json** - App name, short name, icons (192x192, 512x512), theme color, background color, display: standalone
40. **Favicon** - Generated from logo (app/icon.png)
41. **Layout meta tags** - PWA meta tags, apple-mobile-web-app-capable, theme-color, manifest link

### Docker & Deployment
42. **Dockerfile** - Multi-stage build:
    - Stage 1 (deps): node:18-alpine, copy package*.json, npm ci
    - Stage 2 (builder): copy all source, set NEXT_PUBLIC vars via ARG/ENV, set dummy server-side env vars (SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, RESEND_API_KEY, PLAID_CLIENT_ID, PLAID_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN) as "build-placeholder" so API routes don't crash during build, run next build
    - Stage 3 (runner): node:18-alpine, copy standalone + static + public, expose 3000, CMD node server.js
43. **next.config.js** - output: 'standalone'
44. **.gitignore** - node_modules, .next, .env.local, out, coverage
45. **.env.local** - All environment variables (never committed)

### Supabase SQL Migrations (provide as individual .sql files)
46. **001_schedule_requests.sql** - Table with all schedule form fields + status enum (pending/scheduled/declined), RLS policies
47. **002_appointments.sql** - Table with customer info, times, status, google_event_id, reminder flags, FK to schedule_requests
48. **003_invoices.sql** - Table with invoice_number, invoice_type (invoice/quote), customer fields, job_address, jobsite_city, company_name, amount_due, status enum (draft/sent/paid/approved), timestamps, stripe_payment_url
49. **004_invoice_items.sql** - Table with invoice_id FK, description, quantity, unit_price
50. **005_contacts.sql** - Table with name, email, phone, address, city, state, zip, company_name, notes, source
51. **006_create_storage_bucket.sql** - Create 'bookkeeping-images' bucket with public access policies

### Utility Functions (lib/)
52. **lib/supabase.ts** - createServerClient() for API routes, createBrowserClient() for client components
53. **lib/resend.ts** - All email template functions with shared base HTML wrapper
54. **lib/twilio.ts** - sendSMS() function (gracefully skip if Twilio env vars not set)
55. **lib/utils.ts** - formatDateShort(), formatPhone(), formatCurrency() helpers
56. **lib/google-calendar.ts** - createCalendarEvent() for appointment scheduling

## IMPORTANT IMPLEMENTATION NOTES
- Use output: 'standalone' in next.config.js for Docker
- Dummy server-side env vars in Dockerfile prevent API route crashes during next build
- Pass NEXT_PUBLIC vars as --build-arg in Docker build command
- Use Zod for all form validation
- SMS consent checkbox must use z.literal(true) to be required
- Use lucide-react for ALL icons throughout the app
- All admin pages are client components ('use client')
- Invoice numbers auto-increment: fetch max existing number from DB, parse number, add 1
- Email templates use inline CSS only (no external stylesheets, no Tailwind in emails)
- All dates formatted consistently with shared utility functions
- Twilio and Plaid should fail gracefully with console.error if env vars are missing (don't crash the app)
- Auto-save contacts: check if email already exists before inserting (upsert logic)
- Schedule request "Convert to Quote/Invoice" works by navigating to invoices page with URL search params for prefilling

## BUILD ORDER
Build everything in this order:
1. Project setup (next.config, tailwind, package.json, tsconfig)
2. Supabase lib + migrations
3. Utility functions (lib/)
4. Auth (login page, middleware, auth API)
5. Public website (all sections)
6. Admin layout (sidebar, protected routes)
7. Dashboard
8. Schedule Requests (page + API)
9. Appointments (page + API + Google Calendar)
10. Invoices & Quotes (page + API + PDF + email send + attachments)
11. CRM Contacts (page + API + CSV import)
12. Bookkeeping (page + API)
13. Bank Statements / Plaid (page + API)
14. Email templates
15. PWA setup
16. Dockerfile
17. .gitignore + .env.local template

Create ALL files, ALL API routes, ALL components. This should be a complete, production-ready app that I can run with npm install && npm run dev locally, then Docker build and deploy.
```

## Step 4 — After Claude Builds It
1. `npm install` and `npm run dev` - test locally
2. Run all SQL migration files in Supabase SQL Editor (in order: 001 through 006)
3. Create an admin user in Supabase Auth > Users > Invite User
4. Create the `bookkeeping-images` storage bucket in Supabase if migration didn't
5. Upload your logo, email hero image, and email logo to /public/
6. `docker build` with your build args then `docker push`
7. Deploy on Flux - set all env vars from .env.local
8. Point domain DNS (Cloudflare) to Flux domains - A record or CNAME
9. Enable Cloudflare proxy (orange cloud) for SSL

## Step 5 — Optional Add-ons (Set Up Later)
- **Twilio SMS** - Create account, buy number, register A2P 10DLC brand + campaign, add env vars, redeploy
- **Plaid Bank Sync** - Apply for production access, swap PLAID_ENV from sandbox to production once approved
- **Google Calendar** - Set up OAuth consent screen, create credentials, get refresh token, add env vars

## Docker Build Command Template
```
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=[your-url] \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-key] \
  --build-arg NEXT_PUBLIC_APP_URL=https://[yourdomain.com] \
  --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=[your-key] \
  -t [yourdockerhub]/[appname]:latest .
```

## Docker Push Command
```
docker push [yourdockerhub]/[appname]:latest
```
