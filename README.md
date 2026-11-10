# Restaurant Management System

A Next.js storefront and admin dashboard for a restaurant: menu with categories and search, product details, cart, checkout (Cash on Delivery), order tracking, customer accounts, and an admin area for orders, products, customers, staff and sales reports.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 and Lucide icons.

## Getting started

Requires Node.js 20.9 or later. No database or environment variables are needed.

```bash
npm install
npm run dev                  # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Browser tests against the production build (run `npm run build` first) |

## Where data lives

All data is stored in the browser's localStorage, on the device that uses the app. Nothing is sent to a server or database.

| Data | localStorage key | Notes |
| --- | --- | --- |
| Customer accounts | `meg-local:customers` | Passwords are stored as scrypt hashes. |
| Admin and staff accounts | `meg-local:admins` | Passwords are stored as scrypt hashes. |
| Sessions | `meg-local:session…` | Cleared on sign-out. |
| Orders | `meg-local:orders` | Totals are calculated from the menu when the order is placed. |
| Payment records | `meg-local:payments` | Written when an order is placed. |
| Menu products and categories | `meg-local:products`, `meg-local:categories` | Seeded from `src/data/menu.ts` on first use. Admin edits are saved here. |
| Carts, addresses, wishlists, support tickets, notifications | `meg-local:*` | Per customer. |

Because data lives in one browser, accounts and orders created on one device are not visible on another. Clearing site data erases everything.

## Images

The logo, homepage banners and product photos are placeholders until you add images you are allowed to use. Put the files in `public/images/` and set their paths in `src/data/assets.ts`. Admins can also set product images in the dashboard.

## Setting up the first admin

Open `/admin/signup` and create the first admin account. Once an admin exists, that page is closed and new staff are added from the Employees page.

## Tests

`npm test` starts the production build on a free port and drives it with Chrome. Set `CHROME_PATH` if Chrome is not in its default location.

## Project layout

```
src/
  app/            routes (storefront, account, checkout, orders, admin)
  components/     UI by area: layout, sections, cart, checkout, auth, orders, admin, ui
  context/        cart and customer auth providers
  data/           seed menu, hero slides, image slots
  hooks/          small client hooks
  lib/            storage, validation, orders, reports
  lib/local/      the in-browser data layer (localStorage) and the local API handlers
```
