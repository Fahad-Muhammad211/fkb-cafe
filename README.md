# MEG Pakistan – online ordering

A Next.js storefront and admin dashboard modelled on [megpakistan.com](https://megpakistan.com/): menu with categories and search, product details, cart, checkout (Cash on Delivery), order tracking, customer accounts, and an admin area for orders, products, customers and sales reports.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 and Lucide icons.

## Getting started

Requires Node.js 20.9 or later.

```bash
npm install
cp .env.example .env.local   # optional locally, see "Environment variables"
npm run dev                  # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

## Where data lives

This is a demo-grade setup. Know where each kind of data is kept before deploying:

| Data | Stored in | Notes |
| --- | --- | --- |
| Customer accounts | MongoDB `customers` | Passwords hashed with scrypt. Sessions are signed, httpOnly cookies. |
| Orders | MongoDB `orders` | Totals and prices are checked on the server against the menu. |
| Carts (signed-in customers) | MongoDB `carts` | Guests keep their cart in the browser only. |
| Menu products and categories | MongoDB `products` and `categories` | Seeded from `src/data/menu.ts` on first use. Admin edits save to the database. |
| Admin accounts | MongoDB `admins` | Passwords hashed with scrypt. |
| Admin sessions | Signed, httpOnly cookie | Signed with `ADMIN_SESSION_SECRET`. |
| Local copy of menu, orders and cart | The visitor's browser (localStorage) | A cache that the app refreshes from the server. It is not the source of truth. |

The browser cache keeps the storefront working while a request is in flight. If the server cannot be reached, the cached copy is shown.

## Images

The logo, homepage banners and product photos are placeholders until you add images you are allowed to use. Put the files in `public/images/` and set their paths in `src/data/assets.ts`. Admins can also set product images in the dashboard.

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Yes | MongoDB connection string (MongoDB Atlas `mongodb+srv://…`). Keep the real value in `.env.local` only. |
| `MONGODB_DB` | No | Database name inside the cluster. Defaults to `meg`. |
| `ADMIN_SESSION_SECRET` | Yes in production | Signs admin and customer session cookies. Without it, a secret is written to `data/session-secret.txt`, which only works where the server can write files. |

### Local setup with MongoDB

1. Copy `.env.example` to `.env.local` and set `MONGODB_URI`. Replace the password placeholder with the database user's password. URL-encode special characters in it.
2. Start the app with `npm run dev`. The menu seeds itself on first use.
3. To copy existing admin accounts from `data/admin-accounts.json` into the database, run `npm run db:migrate`. Accounts that already exist are skipped, and the JSON file is left unchanged.
4. Admin accounts: the first admin is created at `/admin/signup`. Once any admin exists, that page is closed, and the admin API only accepts new accounts from a signed-in admin. Visit `/admin/signup` before the site is public, or the first admin can be created by anyone who gets there first.
5. Run the tests with `npm run build` followed by `npm test`. They start a server on a temporary database (`meg_test_*`), which is dropped afterwards, and they leave your real database unchanged. The browser tests use Google Chrome; set `CHROME_PATH` if Chrome is not in its default Windows location.

## Deploying to Vercel

1. Push this repository to GitHub and import it in Vercel. The Next.js preset needs no extra settings.
2. In Project Settings → Environment Variables, add `ADMIN_SESSION_SECRET`.
3. Deploy.

Set `MONGODB_URI` and `MONGODB_DB` in Vercel too. Accounts, orders, carts and the menu are stored in MongoDB, so the storefront and admin area work on Vercel without any file storage.

## Project layout

```
src/
  app/            routes (storefront, account, checkout, orders, admin, API)
  components/     UI by area: layout, sections, cart, checkout, auth, orders, admin, ui
  context/        cart and customer auth providers
  data/           seed menu, hero slides, image slots
  hooks/          small client hooks
  lib/            storage, validation, orders, reports, server-only auth (lib/server)
  proxy.ts        redirects signed-out visitors away from /admin
```
