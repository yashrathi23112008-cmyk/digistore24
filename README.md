# AI Script Generator

A premium, dark/glowing 3D-styled web app that:

- Generates video scripts (with optional per-scene image prompts) using **DeepSeek** via **OpenRouter**
- Sells access as credits, granted/renewed through a **Digistore24** webhook (handles both first purchases and repurchases/renewals)
- Gives every user a profile page (avatar, name, credits, expiry, password reset)
- Gives you (only) an **admin page** listing every user

It is a real client + server app: a Node.js/Express backend (where your API keys live) and a
static HTML/CSS/JS frontend (what the browser loads). This split is what keeps your OpenRouter
key, payment secrets and user database safe from anyone visiting the site.

---

## 1. What's in this folder

```
server.js            Express app entry point
db.js                 SQLite database (built into Node — no separate DB to install)
lib/                  Business logic: auth, pricing, OpenRouter calls, billing, email stub
routes/                API endpoints (auth, profile, generate, webhooks, admin)
public/                Everything the browser loads: HTML, CSS, client-side JS
.env.example          Template for your secret keys — copy to .env
```

## 2. Install & run locally

You need **Node.js 22.5 or newer** (the app uses Node's built-in SQLite, so there's nothing
extra to install for the database).

```bash
cd ai-script-app
npm install
cp .env.example .env
```

Now open `.env` in a text editor and fill in the real values (details for each one below).
Then start the app:

```bash
npm start
```

Visit `http://localhost:3000/login.html`. Log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD`
you put in `.env` — that account is created automatically the first time the server runs, and
is also your admin account for `/admin.html`.

---

## 3. Where to paste your API key (and everything else in `.env`)

Open the `.env` file (the copy you made from `.env.example`) and fill in:

| Variable | What it is | Where to get it |
|---|---|---|
| `JWT_SECRET` | Random string used to sign login sessions | Generate with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `OPENROUTER_API_KEY` | **Your AI API key** | [openrouter.ai/keys](https://openrouter.ai/keys) — create a key there |
| `OPENROUTER_MODEL` | Which model to call | Check [openrouter.ai/models](https://openrouter.ai/models) for DeepSeek's current exact model slug — model names change over time, so confirm it there before launch |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Your own login for the admin page | Pick these yourself |
| `DIGISTORE24_IPN_PASSPHRASE` | Shared secret so Digistore24 payment notifications can be verified | Digistore24 dashboard → Settings → IPN |
| `DIGISTORE24_PRODUCT_IDS` | (Optional) restrict which product(s) grant the plan | Your product ID(s) in Digistore24, comma-separated. Leave blank to accept any product on your account |
| `PLAN_CREDITS` / `PLAN_DURATION_DAYS` | Your pricing plan | Defaults to 900 credits / 30 days, per your spec |

**Important:** the `OPENROUTER_API_KEY` is read only inside `lib/openrouter.js`, on the server.
It is never sent to the browser, never appears in any HTML/JS file the visitor downloads, and
is not visible in the page source — this is the whole reason the app has a backend instead of
calling OpenRouter directly from the browser (which would expose the key to every visitor).

---

## 4. How the credit pricing works

Defined once in `lib/pricing.js` so the price shown to the user and the price actually charged
can never disagree:

| Script length | Image prompts OFF | Image prompts ON |
|---|---|---|
| 60 seconds | 1 credit | 2 credits |
| 5 minutes | 5 credits | 10 credits |
| 10 minutes | 10 credits | 20 credits |
| 15 minutes | 15 credits | 30 credits |

Credits are only deducted **after** a successful AI response, and the server always re-checks
the user's real balance and plan-expiry date from the database before generating — it never
trusts a number the browser sends.

---

## 5. Connecting Digistore24 (so purchases actually grant credits)

Digistore24 sends a webhook — they call it an **IPN, Instant Payment Notification** — to your
server whenever someone pays, renews, or rebills. One endpoint handles all of it:

- In your Digistore24 product's IPN settings, set the URL to
  `https://yourdomain.com/webhook/digistore24`.
- Set the **same passphrase** in that IPN setting and in your `.env` file's
  `DIGISTORE24_IPN_PASSPHRASE` — this is what lets the server verify the notification really
  came from Digistore24 and wasn't forged.
- (Optional) if you sell more than one product from the same Digistore24 account and only want
  *this* plan's product to grant credits, list its product ID(s) in `DIGISTORE24_PRODUCT_IDS`.

The same endpoint handles both cases from your spec automatically:

- **New email address** → creates the account, sets `PLAN_CREDITS` credits and an expiry date
  `PLAN_DURATION_DAYS` days out, and emails (see section 6) a temporary password. The user shows
  up in your admin page right away.
- **Existing email address** (a repurchase/rebill) → tops credits back up to `PLAN_CREDITS` and
  recalculates the expiry date as *today + `PLAN_DURATION_DAYS` days*, exactly like your spec
  asked for.

**Please read this carefully:** Digistore24 occasionally adjusts exact IPN field names. I built
`routes/webhooks.js` following their commonly documented IPN scheme (form-encoded fields, an
`sha_sign` signature, `on_payment`/`on_rebill_payment` events), with detailed comments in that
file — but before you go live, use Digistore24's **"Send test IPN"** button in your account and
check your server logs to confirm the payload matches what the code expects. I don't have the
ability to browse the very latest Digistore24 docs from inside this conversation, so please
double-check that page before launch.

---

## 6. Email (currently a stub — you need to connect a real provider)

Password-reset links and "welcome, here's your password" emails are currently just **printed to
your server console**, not actually emailed — this lets you test the whole flow without signing
up for an email service first.

Before launch, open `lib/mailer.js` and replace the body of `sendEmail()` with a real provider
call (Resend and SendGrid examples are already written in the comments there). Then add that
provider's API key to `.env`.

---

## 7. Security notes (what's already handled)

- Passwords are hashed with `bcryptjs` — never stored in plain text.
- Login sessions are `httpOnly` cookies (invisible to page JavaScript, so a malicious script
  can't steal them) and signed with `JWT_SECRET`.
- Every profile/credit-related route reads the user's identity from their own signed session,
  never from a value the browser is trusted to send — so one user can never view or edit another
  user's data.
- `/admin.html` and every `/api/admin/*` route check `is_admin = 1` on the server on every
  request; a non-admin visiting that page is redirected away, and the underlying API calls
  return `403 Forbidden`.
- The Digistore24 webhook is signature-verified before anything happens to your database
  (see section 5).
- The OpenRouter key and all other secrets live only in `.env` on the server (never commit this
  file — it's already in `.gitignore`).

## 8. Deploying (e.g. to Railway, since that's what you mentioned)

1. Push this folder to a GitHub repo (`.env` will not be included, thanks to `.gitignore`).
2. Create a new Railway project from that repo.
3. In Railway's **Variables** tab, add every key from `.env.example` with your real values.
4. Railway will run `npm install` then `npm start` automatically.
5. Once deployed, update `APP_URL` in your Railway variables to your real Railway URL, and use
   that same URL plus `/webhook/digistore24` as the IPN URL in your Digistore24 product settings.

Because the database is a single SQLite file (`data/app.db`), make sure Railway's volume/storage
for this service persists between deploys — otherwise your user data will reset every time you
redeploy. Check Railway's current docs for attaching a persistent volume to a service.

---

## 9. What I'd recommend double-checking before real customers use this

- The exact OpenRouter model slug for "DeepSeek V3.2" (model names on OpenRouter change).
- The exact Digistore24 IPN field names and signature method (see section 5).
- Swapping the email stub for a real provider (section 6).
- Whether you want additional protections like rate-limiting the login and generate endpoints,
  and HTTPS enforcement (Railway provides HTTPS automatically on its own domains).
