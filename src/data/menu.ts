import {
  Beef,
  CakeSlice,
  Coffee,
  CupSoda,
  Droplets,
  Drumstick,
  IceCream,
  Salad,
  Sandwich,
  Soup,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { MenuCategory, MenuItem } from "@/types";

// Categories in the order used on megpakistan.com.
export const MENU_CATEGORIES: MenuCategory[] = [
  { id: "light-eats", label: "Light Eats", icon: Salad, tagline: "Balanced Bites For A Better You." },
  { id: "beef-burgers", label: "Beef Burgers", icon: Beef, tagline: "Bite Into Joy, Experience our MEGic Today!" },
  { id: "chicken-burgers", label: "Chicken Burgers", icon: Drumstick, tagline: "Bite Into Joy, Experience our MEGic Today!" },
  { id: "wraps", label: "Wraps", icon: Sandwich },
  { id: "fries", label: "Fries", icon: Utensils },
  { id: "pasta", label: "Pasta", icon: Soup },
  { id: "iced-blends", label: "Iced Blends", icon: IceCream },
  { id: "hot-beverages", label: "Hot Beverages", icon: Coffee },
  { id: "sweet-treats", label: "Sweet Treats", icon: CakeSlice },
  { id: "cheers", label: "Cheers", icon: CupSoda },
  { id: "meg-dips", label: "MEG Dips", icon: Droplets },
];

// Icons are stored by name in the database, so the category store maps names back to icons.
export const ICON_MAP: Record<string, LucideIcon> = {
  Salad,
  Beef,
  Drumstick,
  Sandwich,
  Utensils,
  Soup,
  IceCream,
  Coffee,
  CakeSlice,
  CupSoda,
  Droplets,
};

// Full menu with prices in PKR, taken from the MEG menu pages supplied by the owner.
// Photos are mapped in data/assets.ts. Meal and add-on options are in data/menuOptions.ts.
export const MENU_ITEMS: MenuItem[] = [
  // Light Eats
  { id: "chicken-tenders", categoryId: "light-eats", name: "Chicken Tenders", pieces: "3 Pcs", price: 499 },
  { id: "mashed-potatoes", categoryId: "light-eats", name: "Mashed Potatoes", price: 349 },
  { id: "peri-peri-strips", categoryId: "light-eats", name: "Peri Peri Strips", price: 549 },
  { id: "mozzarella-sticks", categoryId: "light-eats", name: "Mozzarella Sticks", price: 599 },
  { id: "nachos", categoryId: "light-eats", name: "Nachos", price: 549 },
  { id: "chicken-tacos", categoryId: "light-eats", name: "Chicken Tacos", pieces: "2 Pcs", description: "Tangy sriracha sauce, salsa sauce on top & lettuce.", price: 699 },
  { id: "beef-tacos", categoryId: "light-eats", name: "Beef Tacos", pieces: "2 Pcs", description: "Secret MEG sauce, lettuce, salsa sauce on top.", price: 699, badge: "Hot Selling" },

  // Beef burgers
  { id: "meg-classic", categoryId: "beef-burgers", name: "MEG Classic", description: "Signature black bun, American cheese slice, secret MEG sauce, grilled onions, pickles & lettuce.", price: 829, badge: "Signature" },
  { id: "shroom-melt", categoryId: "beef-burgers", name: "Shroom Melt", description: "American cheese slice, shroom sauce, lettuce & a little touch of honey mustard.", price: 799 },
  { id: "smokehouse", categoryId: "beef-burgers", name: "Smokehouse", description: "American cheese slice, secret MEG sauce, smokey BBQ sauce, pastrami, onion rings & lettuce.", price: 799 },
  { id: "salsa-jalapeno", categoryId: "beef-burgers", name: "Salsa Jalapeno", description: "American cheese slice, salsa sauce, cheese sauce, nachos, jalapenos & lettuce.", price: 799 },
  { id: "philly-cheesesteak", categoryId: "beef-burgers", name: "Philly Cheesesteak", description: "American cheese slice, garlic mayo sauce, grilled vegetables (mushrooms, onions, capsicum) & a touch of honey mustard.", price: 799 },

  // Chicken burgers
  { id: "tangy-mustard", categoryId: "chicken-burgers", name: "Tangy Mustard", description: "House fried patty, American cheese, onion, tomato, lettuce, tangy mustard sauce.", price: 799 },
  { id: "parmesan", categoryId: "chicken-burgers", name: "Parmesan", description: "House fried patty, melted cheese over patty, in-house marinara sauce & basil mayo.", price: 799 },
  { id: "peri-peri", categoryId: "chicken-burgers", name: "Peri Peri", description: "House grilled chicken, American cheese slice, hot peri peri sauce, sriracha sauce, fresh tomatoes & onions.", price: 799 },
  { id: "flaming-hot", categoryId: "chicken-burgers", name: "Flaming Hot", description: "House fried patty, American cheese slice, chipotle sauce, jalapeños, lettuce & cheesy sauce.", price: 799, badge: "Hot Selling" },
  { id: "chicken-fillet", categoryId: "chicken-burgers", name: "Chicken Fillet", description: "House fried patty, American cheese slice, tangy sriracha sauce & lettuce.", price: 799 },
  { id: "southern-fried", categoryId: "chicken-burgers", name: "Southern Fried", description: "House fried thigh patty, chipotle sauce, lettuce & a touch of honey mustard.", price: 799 },

  // Wraps
  { id: "chipotle-wrap", categoryId: "wraps", name: "Chipotle Wrap", description: "Tortilla bread, fries, jalapenos, lettuce, filled with chipotle sauce.", price: 799 },
  { id: "garlic-mayo-wrap", categoryId: "wraps", name: "Garlic Mayo Wrap", description: "Tortilla bread, in-house garlic sauce, lettuce, pickles, red cabbage & onions.", price: 799 },
  { id: "honey-mustard-wrap", categoryId: "wraps", name: "Honey Mustard Wrap", description: "Tortilla bread, in-house honey mustard, lettuce, pickles, red cabbage & onions.", price: 799 },

  // Fries
  { id: "chicken-loaded-fries", categoryId: "fries", name: "Chicken Loaded Fries", description: "Fries loaded with chicken, tangy sriracha sauce on top, a touch of cheese sauce, jalapenos & lettuce.", price: 699 },
  { id: "beefy-loaded-fries", categoryId: "fries", name: "Beefy Loaded Fries", description: "Fries loaded with beef, MEG sauce, smokey BBQ sauce & pastrami on top.", price: 699 },
  { id: "shroom-fries", categoryId: "fries", name: "Shroom Fries", description: "Fries with shroom sauce.", price: 399 },
  { id: "flaming-hot-fries", categoryId: "fries", name: "Flaming Hot Fries", price: 349 },
  { id: "salted-fries", categoryId: "fries", name: "Salted Fries", price: 299 },
  { id: "curly-fries", categoryId: "fries", name: "Curly Fries", price: 459 },

  // Pasta
  { id: "fettuccine-alfredo", categoryId: "pasta", name: "Fettuccine Alfredo", price: 1099 },

  // Iced blends
  { id: "iced-mocha", categoryId: "iced-blends", name: "Iced Mocha", price: 549 },
  { id: "caramel-frappe", categoryId: "iced-blends", name: "Caramel Frappe", price: 549 },
  { id: "oreo-shake", categoryId: "iced-blends", name: "Oreo Shake", price: 549 },
  { id: "vanilla-shake", categoryId: "iced-blends", name: "Vanilla Shake", price: 549 },
  { id: "choco-shake", categoryId: "iced-blends", name: "Choco Shake", price: 549 },
  { id: "coco-pineapple", categoryId: "iced-blends", name: "Coco Pineapple", price: 549 },

  // Hot beverages
  { id: "cappuccino", categoryId: "hot-beverages", name: "Cappuccino", price: 299 },
  { id: "caramel-latte", categoryId: "hot-beverages", name: "Caramel Latte", price: 299 },
  { id: "americano", categoryId: "hot-beverages", name: "Americano", price: 299 },
  { id: "hot-chocolate", categoryId: "hot-beverages", name: "Hot Chocolate", price: 349 },
  { id: "cardamom-tea", categoryId: "hot-beverages", name: "Cardamom Tea", price: 299 },
  { id: "green-tea", categoryId: "hot-beverages", name: "Green Tea", price: 299 },

  // Sweet treats
  { id: "lotus-tres-leches", categoryId: "sweet-treats", name: "Lotus Tres Leches", price: 699 },
  { id: "matilda-cake", categoryId: "sweet-treats", name: "Matilda Cake", price: 699 },

  // Cheers (drinks)
  { id: "mint-margarita", categoryId: "cheers", name: "Mint Margarita", price: 399 },
  { id: "purple-heaven", categoryId: "cheers", name: "Purple Heaven", price: 349 },
  { id: "peachy-chills", categoryId: "cheers", name: "Peachy Chills", price: 349 },
  { id: "electric-blue", categoryId: "cheers", name: "Electric Blue", price: 349 },
  { id: "green-apple", categoryId: "cheers", name: "Green Apple", price: 349 },
  { id: "fresh-lime", categoryId: "cheers", name: "Fresh Lime", price: 249 },
  { id: "soft-drink", categoryId: "cheers", name: "Soft Drink", price: 149 },
  { id: "mineral-water", categoryId: "cheers", name: "Mineral Water", price: 99 },

  // MEG dips
  { id: "meg-sauce", categoryId: "meg-dips", name: "MEG Sauce", price: 99 },
  { id: "sriracha-dip", categoryId: "meg-dips", name: "Sriracha", price: 99 },
  { id: "honey-mustard-dip", categoryId: "meg-dips", name: "Honey Mustard", price: 99 },
  { id: "bbq-dip", categoryId: "meg-dips", name: "BBQ", price: 99 },
  { id: "chipotle-dip", categoryId: "meg-dips", name: "Chipotle", price: 99 },
  { id: "garlic-mayo-dip", categoryId: "meg-dips", name: "Garlic Mayo", price: 99 },
];
