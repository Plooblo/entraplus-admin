# EntraPlus admin panel

A separate, private control panel for you. It's not linked from the website and is hidden from search engines.

**What it can do:**

- **Organisations:** all of them, with managers, people waiting for approval, seats used against paid, licence
  status and renewal or end dates, plus totals and monthly revenue.
- **Licences for an organisation:**
  - **Give a free trial** of 14, 30, 60 or 90 days, for any number of seats.
  - **Give a manual or complimentary licence** until a date you choose. Use it for partner schools, invoiced
    customers, or "another year on us".
  - **Extend** by 30 days, 90 days or a year. On a paid Stripe subscription this gives free time by pushing their next
    payment back, so they aren't charged for it.
  - **Change seats** on a trial or manual licence. Paid seats stay with the manager's Stripe billing.
  - **Remove** at the end of the period, or now. Paid subscriptions are cancelled in Stripe.
  - **Resync from Stripe:** pulls in every subscription and invoice Stripe has for the organisation. This fills in
    purchase history that was missed.
  - **Cancel duplicate** Stripe subscriptions, if someone checked out twice.
  - **People:** approve, change roles, give or take seats, remove.
- **Coupons:** create codes like `HALLOWEEN20` (20% off), choose whether it applies to the first payment, a number of
  months, or every payment, set a last day to use it and a maximum number of uses, limit it to new customers, and
  turn codes on and off. Customers type the code on Stripe's checkout page.
- **Audit log:** every change made in the panel, with who made it and when.

## How it's kept secure

- **Only your Microsoft account.** Every request goes to the `admin` server function, which checks the caller signed in
  with Microsoft **and** that their account ID is in the `ADMIN_USER_IDS` secret. That check happens on the server
  every time, so nobody else can use it, even with a copy of these files.
- **The page itself has no special access.** It holds no secrets; the Supabase key in `config.js` is the same public
  one the website uses.
- **Hidden and hardened:** a strict content security policy, no embedding in other sites, and hidden from search
  engines.
- **Your sign-in protects it.** Your Microsoft account's MFA and Conditional Access apply to signing in here.
- **Every change is audited.**

## Set up (once)

1. **Database.** Supabase > SQL Editor: run `entraplus-site/backend/supabase/update-admin.sql`.

2. **Deploy.** From `entraplus-site/backend`:
   ```
   supabase functions deploy admin
   supabase functions deploy stripe-webhook --no-verify-jwt
   supabase functions deploy app-auth --no-verify-jwt
   ```
   The webhook and app-auth share the new billing rules, so redeploy them too.

3. **`config.js`.** Paste the same publishable (anon) key that's in the website's `config.js`.

4. **Host it.** Choose one:
   - **Its own address (recommended):**
     1. Make a new **private** GitHub repository, e.g. `entraplus-admin`, and upload this folder.
     2. Turn on Pages, and set the custom domain to `admin.entraplus.co.uk`.
     3. At your DNS provider, add a CNAME record: `admin` → `YOURGITHUBNAME.github.io`.
     4. Tick **Enforce HTTPS**.

     Private repositories need a paid GitHub plan for Pages. Cloudflare Pages is free for private sites, and you can
     upload the folder directly.
   - **Just on your PC:** in this folder run `python -m http.server 8090`, then open http://localhost:8090.

5. **Allow the address in Supabase.** Authentication > URL Configuration > Redirect URLs: add
   `https://admin.entraplus.co.uk/` and/or `http://localhost:8090/`.

6. **Make yourself the admin.**
   1. Open the panel and sign in with Microsoft. It shows "Not an admin account" with your **user ID** and a Copy
      button.
   2. In Supabase > Edge Functions > Secrets, add:
      - `ADMIN_USER_IDS`: your user ID. To add another admin later, separate the IDs with commas.
      - `ADMIN_ORIGIN`: `https://admin.entraplus.co.uk` (or `http://localhost:8090`).
   3. Reload the panel.

7. **First jobs.**
   - Open your organisation and press **Resync from Stripe**, which fills your missing purchase history.
   - Then **Cancel duplicate** on the extra test subscriptions you don't want.

## If sign-in doesn't open the panel

The panel now says exactly what went wrong instead of quietly showing Sign in again. If it shows an error, open
**Details for troubleshooting** and send a screenshot. The usual causes:

- **"No record of starting it here".** You started on a slightly different address from the one Supabase returned to.
  Always open exactly `https://admin.entraplus.co.uk/` (https, no `www`), and make sure Supabase > Authentication >
  URL Configuration > **Redirect URLs** contains `https://admin.entraplus.co.uk/**`. The **Site URL** there must stay
  `https://entraplus.co.uk`.
- **"Couldn't reach the admin function".** `ADMIN_ORIGIN` should be `https://admin.entraplus.co.uk`, or the admin
  function isn't deployed yet.
- **"Not an admin account".** Copy the ID it shows into `ADMIN_USER_IDS`. Quotes, spaces and new lines don't matter.

## Preview it without signing in

Set `mock: true` in `config.js` and open `index.html` through `python -m http.server`. You get made-up data and
nothing is saved. Set it back to `false` before hosting.

## Trials for new customers at checkout

Trials from the panel are for organisations you choose. If you'd like **every** new customer to start with a free trial
before their first payment, that's a setting on the Stripe payment links ("trial period days"). I can add it through
the Stripe connector if you want it.
