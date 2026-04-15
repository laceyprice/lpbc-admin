# The Gasologist — Setup Guide

## Prerequisites
- Node.js 18+
- A Supabase account (free tier works)
- A Stripe account
- A Resend account (for emails)
- A Twilio account (for SMS)
- A Google Cloud project (for Google Calendar)

---

## Step 1: Install Dependencies

```bash
cd gasologist
npm install
```

---

## Step 2: Supabase Setup

1. Go to [supabase.com](https://supabase.com) → New Project
2. Once created, go to **SQL Editor** and run the entire contents of `supabase/schema.sql`
3. Go to **Storage → New Bucket** → name it `tax-documents` → set it to **Public**
4. Go to **Authentication → Users → Add User**:
   - Email: `office@thegasologist.com`
   - Set a strong password
5. Grab your keys from **Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key (keep secret!)

---

## Step 3: Stripe Setup

1. Go to [stripe.com](https://stripe.com) → Create account
2. In **Developers → API Keys**, grab:
   - `STRIPE_SECRET_KEY` = Secret key (starts with `sk_`)
   - `STRIPE_PUBLISHABLE_KEY` = Publishable key (starts with `pk_`)
3. Set up Webhook:
   - Go to **Developers → Webhooks → Add endpoint**
   - URL: `https://yourdomain.com/api/stripe`
   - Events to listen to: `checkout.session.completed`
   - After creating, reveal the **Signing secret** → `STRIPE_WEBHOOK_SECRET`

---

## Step 4: Resend Setup (Email)

1. Go to [resend.com](https://resend.com) → Create account
2. Add and verify your domain (add DNS records for `thegasologist.com`)
3. Go to **API Keys → Create API Key**
4. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (e.g. `noreply@thegasologist.com`)

---

## Step 5: Twilio Setup (SMS)

1. Go to [twilio.com](https://twilio.com) → Create account
2. Get a phone number (SMS-capable)
3. From the dashboard, grab:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER` (your Twilio number, e.g. `+14155551234`)

---

## Step 6: Google Calendar Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable the **Google Calendar API**
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: Web application
   - Authorized redirect URIs: `https://developers.google.com/oauthplayground`
5. Note your **Client ID** and **Client Secret**
6. Go to [OAuth Playground](https://developers.google.com/oauthplayground):
   - Click the gear icon → check "Use your own OAuth credentials"
   - Enter your Client ID and Client Secret
   - In Step 1, select `Google Calendar API v3` → `https://www.googleapis.com/auth/calendar`
   - Click "Authorize APIs" and grant access to `office@thegasologist.com`
   - In Step 2, click "Exchange authorization code for tokens"
   - Copy the **Refresh Token**
7. Set environment variables:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN`
   - `GOOGLE_CALENDAR_ID` = `office@thegasologist.com`

---

## Step 7: Environment Variables

Copy `.env.local.example` to `.env.local` and fill in all values:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with all your keys from steps 2–6.

---

## Step 8: Run Locally

```bash
npm run dev
```

Visit:
- Public site: http://localhost:3000
- Admin login: http://localhost:3000/admin/login

---

## Step 9: Deploy to Vercel

1. Push to GitHub
2. Go to [vercel.com](https://vercel.com) → Import project
3. Add all environment variables from `.env.local`
4. Deploy!
5. After deploy, update `APP_URL` in env vars to your production URL (e.g. `https://thegasologist.vercel.app`)
6. Update your Stripe webhook endpoint URL to the production URL

---

## Step 10: Set Up SMS Reminder Cron

The reminder system needs to run hourly. Use a free cron service:

### Option A: Vercel Cron (recommended if on Vercel Pro)
Add to `vercel.json`:
```json
{
  "crons": [{ "path": "/api/reminder-cron", "schedule": "0 * * * *" }]
}
```
Add `Authorization: Bearer <CRON_SECRET>` header in the cron config.

### Option B: cron-job.org (free)
1. Go to https://cron-job.org → Create account
2. Add a new cron job:
   - URL: `https://yourdomain.com/api/reminder-cron`
   - Schedule: Every hour
   - Header: `Authorization: Bearer <your CRON_SECRET>`

---

## Admin Guide

### First-time login
- URL: `/admin/login`
- Email: `office@thegasologist.com`
- Password: the one you set in Supabase

### Modules
| Module | URL | Description |
|--------|-----|-------------|
| Dashboard | `/admin` | Overview stats + recent invoices |
| CRM | `/admin/crm` | Contacts management |
| Invoices | `/admin/invoices` | Invoices & quotes |
| Calendar | `/admin/calendar` | Appointments + Google Calendar sync |
| Schedule Requests | `/admin/schedule-requests` | Incoming service requests |
| Bookkeeping | `/admin/bookkeeping` | CSV import + transaction categorization |
| W-9 / 1099 | `/admin/taxes` | Tax document management |

### Sending an Invoice
1. Create invoice in `/admin/invoices`
2. Click the paper-plane icon to send
3. Customer receives email with Stripe payment link
4. When paid, invoice auto-updates to "Paid" via Stripe webhook

### Importing Bank Transactions
1. Download CSV from your bank
2. Go to `/admin/bookkeeping` → Import CSV
3. Click on any transaction to categorize it
4. Categorized transactions sync to the Accounting Ledger automatically

---

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Payments**: Stripe Checkout
- **Email**: Resend
- **SMS**: Twilio
- **Calendar**: Google Calendar API
- **Styling**: Tailwind CSS
- **Deployment**: Vercel (recommended)
