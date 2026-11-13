// Image slots for the storefront. Every entry is a path under /public. These images were
// supplied by the owner. Leave a slot out to show the styled placeholder instead.

export const SITE_ASSETS: { logo: string | null } = {
  logo: null, // e.g. "/images/logo.png" (square, shown in the round header badge)
};

// Homepage banner images, keyed by slide id in data/hero.ts.
export const HERO_IMAGES: Record<string, string> = {
  "flaming-hot": "/images/hero/1789560218_792bef48bc96b8c9.webp",
  "meg-classic": "/images/hero/1789560213_e83580648c86416b.webp",
};

// Product photos, keyed by product id in data/menu.ts. Images set by an admin in the
// dashboard take priority over these.
export const PRODUCT_IMAGES: Record<string, string> = {
  "meg-classic": "/images/products/meg-classic.webp",
  "shroom-melt": "/images/products/shroom-melt.webp",
  smokehouse: "/images/products/smokehouse.webp",
  "flaming-hot": "/images/products/flaming-hot.webp",
  "chicken-fillet": "/images/products/chicken-fillet.webp",
  parmesan: "/images/products/parmesan.webp",
  "shroom-fries": "/images/products/shroom-fries.webp",
  "chicken-tenders": "/images/products/chicken-tenders.jpg",
  "nachos": "/images/products/nachos.png",
  "chicken-tacos": "/images/products/chicken-tacos.png",
  "beef-tacos": "/images/products/beef-tacos.png",
  "philly-cheesesteak": "/images/products/philly-cheesesteak.png",
  "tangy-mustard": "/images/products/tangy-mustard.png",
  "peri-peri": "/images/products/peri-peri.png",
  "southern-fried": "/images/products/southern-fried.png",
  "chipotle-wrap": "/images/products/chipotle-wrap.png",
  "garlic-mayo-wrap": "/images/products/garlic-mayo-wrap.png",
  "chicken-loaded-fries": "/images/products/chicken-loaded-fries.png",
  "beefy-loaded-fries": "/images/products/beefy-loaded-fries.png",
  "flaming-hot-fries": "/images/products/flaming-hot-fries.png",
  "salted-fries": "/images/products/salted-fries.png",
  "curly-fries": "/images/products/curly-fries.png",
  "fettuccine-alfredo": "/images/products/fettuccine-alfredo.png",
  "iced-mocha": "/images/products/iced-mocha.png",
  "caramel-frappe": "/images/products/caramel-frappe.png",
  "oreo-shake": "/images/products/oreo-shake.png",
  "vanilla-shake": "/images/products/vanilla-shake.png",
  "choco-shake": "/images/products/choco-shake.png",
  "coco-pineapple": "/images/products/coco-pineapple.png",
  "cappuccino": "/images/products/cappuccino.png",
  "caramel-latte": "/images/products/caramel-latte.png",
  "americano": "/images/products/americano.png",
  "hot-chocolate": "/images/products/hot-chocolate.png",
  "cardamom-tea": "/images/products/cardamom-tea.png",
  "green-tea": "/images/products/green-tea.png",
  "lotus-tres-leches": "/images/products/lotus-tres-leches.jpg",
  "matilda-cake": "/images/products/matilda-cake.jpg",
  "mint-margarita": "/images/products/mint-margarita.png",
  "purple-heaven": "/images/products/purple-heaven.png",
  "peachy-chills": "/images/products/peachy-chills.png",
  "electric-blue": "/images/products/electric-blue.png",
  "green-apple": "/images/products/green-apple.png",
  "fresh-lime": "/images/products/fresh-lime.png",
  "soft-drink": "/images/products/soft-drink.png",
  "mineral-water": "/images/products/mineral-water.png",
  "meg-sauce": "/images/products/meg-sauce.png",
  "honey-mustard-dip": "/images/products/honey-mustard-dip.png",
};

// Category tab images, keyed by category id. Categories without one show their icon.
export const CATEGORY_IMAGES: Record<string, string> = {
  "light-eats": "/images/categories/light-eats.png",
  "beef-burgers": "/images/products/meg-classic.webp",
  "chicken-burgers": "/images/products/flaming-hot.webp",
  wraps: "/images/categories/wraps.png",
  fries: "/images/products/shroom-fries.webp",
  pasta: "/images/categories/pasta.png",
  "iced-blends": "/images/categories/iced-blends.png",
  "hot-beverages": "/images/categories/hot-beverages.png",
  "sweet-treats": "/images/categories/sweet-treats.png",
  cheers: "/images/categories/cheers.png",
  "meg-dips": "/images/categories/meg-dips.png",
};

// City artwork for the location picker, keyed by city name. Cities without one show an icon.
export const CITY_IMAGES: Record<string, string> = {
  Lahore: "/images/cities/lahore.svg",
  Islamabad: "/images/cities/islamabad.svg",
  Gujranwala: "/images/cities/gujranwala.svg",
};

// Printed menu pages, shown in the "View full menu" window.
export const MENU_PAGES = [
  { src: "/images/menu/menu-page-1.webp", alt: "MEG menu page 1: Main Eats, Light Eats, Wraps and meal add-ons", width: 638, height: 800 },
  { src: "/images/menu/menu-page-2.webp", alt: "MEG menu page 2: Fries, Pasta, Iced Blends, Hot Beverages, Sweet Treats, Cheers and MEG Dips", width: 638, height: 800 },
];
