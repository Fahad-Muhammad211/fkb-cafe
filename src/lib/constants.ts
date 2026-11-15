export const SITE = {
  name: "Restaurant Management System",
  description: "Order food from Restaurant Management System for delivery or pick-up.",
  url: "https://megpakistan.com",
} as const;

export const CONTACT_PHONE = {
  display: "042 111 634 111",
  href: "tel:+920421116341111",
} as const;

// Contact details shown in the footer, as listed on the reference site.
export const CONTACT_EMAIL = "support@megpakistan.com";
export const BRANCH_ADDRESS = "C43-24 CCB, Block M 3 A Lake City, Lahore, 54000";
export const DELIVERY_HOURS = "11:00 AM – 03:50 AM";
export const DELIVERY_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

// Delivery estimate shown in the cart, as on the reference site. Adjust to your real times.
export const DELIVERY_ESTIMATE_MINUTES = 45;

// Flat delivery fee in PKR, applied to delivery orders (pick-up orders are free).
// Paying by card (card machine at the door or counter) takes this share off the food subtotal.
export const CARD_DISCOUNT_RATE = 0.1;
// Promised times, counted from when the restaurant confirms the order.
export const ETA_MINUTES = { delivery: 40, pickup: 20 } as const;

export const DELIVERY_FEE = 150;

export const CART_STORAGE_KEY = "meg-cart-v1";
