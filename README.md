# Restaurant Management System

A Next.js storefront and admin dashboard for a restaurant: menu with categories and search, product details, cart, checkout (Cash on Delivery), order tracking, customer accounts, and an admin area for orders, products, customers, restaurants, staff and sales reports.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, MongoDB and Lucide icons.

## Getting started

Requires Node.js 20.9 or later and a MongoDB database (for example MongoDB Atlas).

```bash
npm install
cp .env.example .env.local   # then fill in MONGODB_URI, MONGODB_DB and ADMIN_SETUP_KEY
npm run db:ping              # read-only connection check
npm run dev                  # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | API and browser tests against the production build (run `npm run build` first) |
| `npm run db:ping` | Read-only check of the database in `.env.local`: ping and record counts per collection |
| `npm run db:backup` | Read-only backup of every collection to `backups/` (gitignored) |

## Where data lives

All accounts, sessions and business records are stored in MongoDB and are only read or changed by the server (`src/app/api/[...path]/route.ts` → `src/lib/server/`). Every API route checks the caller's session on the server before it reads or changes anything.

| Data | Collection | Notes |
| --- | --- | --- |
| Customer accounts | `customers` | Passwords are stored as PBKDF2-SHA256 hashes. |
| Admin and owner accounts | `admins` | Passwords are stored as PBKDF2-SHA256 hashes. |
| Sessions | `sessions` | The browser holds a random token in an httpOnly cookie (`meg_admin_session`, `meg_customer_session`); only its SHA-256 hash is stored. Expired sessions are removed automatically. |
| Orders, payments, status history | `orders`, `payments`, `order_status_history` | Totals are calculated from the menu when the order is placed. |
| Menu | `products`, `categories` | Seeded from `src/data/menu.ts` on first use. Admin edits are saved here. |
| Restaurants and their records | `restaurants`, `grocery_items`, `purchases`, `attendance_records`, `riders` | |
| Staff and activity | `staff_members`, `manager_activity` | |
| Customer extras | `carts`, `addresses`, `wishlists`, `support_tickets`, `coupons` | Per customer. |

The browser's localStorage keeps only personal preferences: the guest cart (`meg-cart-v1`) and the chosen delivery location (`meg-location-v1`). Data saved in localStorage by older versions of the app (`meg-local:*`, `meg.session.*`, cached menu and orders) is deleted automatically the next time the app loads.

## Setting up the first Admin

1. Set `ADMIN_SETUP_KEY` in `.env.local` (or your host's environment settings) to a random value of at least 16 characters, and restart the app.
2. On the same machine as the server, open `http://localhost:3000/admin/login`, click **Sign Up** and enter your Full Name, Email (Gmail) and Password. The key is never typed into or shown in the page; the server only checks that it is configured. You are signed in and taken to the Admin dashboard.
3. Sign-up closes for good once the first Admin exists; the Sign Up view then says it is closed. Owners and Managers are added by the Admin from the Employees page (each belongs to one restaurant and works in `/owner`). You can remove `ADMIN_SETUP_KEY` afterwards.

First-Admin sign-up is accepted only while `ADMIN_SETUP_KEY` is set, no Admin exists, and the request comes from the server's own machine (a hosted site behind `TRUSTED_PROXY_HOPS` never qualifies). Without a trusted proxy that check relies on request headers, which a hand-crafted request could fake, so until the first Admin exists run the dev server with `next dev -H 127.0.0.1` to keep other machines out entirely. Only the Admin can open `/admin` and its APIs; Owners and Managers are sent to `/owner`.

## Login rate limiting

Failed logins are limited to 10 per account per 15 minutes (shared by `/login` and `/admin/login`). If the app runs behind a proxy that appends the visitor's address to `X-Forwarded-For` (Vercel, or one nginx/Caddy reverse proxy), set `TRUSTED_PROXY_HOPS=1` to also limit failures per visitor IP. Leave it unset when the app is reached directly: the header is then ignored, because a client can send any value in it.

## Images

The logo, homepage banners and product photos are placeholders until you add images you are allowed to use. Put the files in `public/images/` and set their paths in `src/data/assets.ts`. Admins can also set product images in the dashboard.

## Tests

`npm test` starts the production build against a throwaway in-memory MongoDB server (`mongodb-memory-server`) and drives it through the API and with Chrome. The tests never connect to the database in `.env.local`. Set `CHROME_PATH` if Chrome is not in its default location.

## Project layout

```
src/
  app/            routes (storefront, account, checkout, orders, admin) and the API route
  components/     UI by area: layout, sections, cart, checkout, auth, orders, admin, ui
  context/        cart and customer auth providers
  data/           seed menu, hero slides, image slots
  hooks/          small client hooks
  lib/            browser helpers: API clients, validation, reports, preferences storage
  lib/server/     server-only data layer: MongoDB access, sessions and the API handlers
scripts/          database maintenance (ping, backup)
tests/            API and browser tests
```
