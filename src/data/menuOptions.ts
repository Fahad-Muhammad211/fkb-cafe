import type { MenuItem, ProductOption } from "@/types";

// "Make it a meal" and "Add-on" choices from the MEG menu page, offered in the product window.
// Kept here (not on each product) so they apply to whole categories.

export interface OptionGroupDef {
  id: string;
  label: string;
  options: ProductOption[];
}

const MEAL: OptionGroupDef = {
  id: "meal",
  label: "Make it a meal",
  options: [
    { id: "none", label: "No meal", priceDelta: 0 },
    { id: "fries-drink", label: "Fries & Drink", priceDelta: 299 },
    { id: "fries-cheers", label: "Fries & Cheers", priceDelta: 499 },
    { id: "curly-drink", label: "Curly Fries & Drink", priceDelta: 549 },
    { id: "curly-cheers", label: "Curly Fries & Cheers", priceDelta: 699 },
  ],
};

const ADD_ON: OptionGroupDef = {
  id: "add-on",
  label: "Add-on",
  options: [
    { id: "none", label: "No add-on", priceDelta: 0 },
    { id: "patty-cheese", label: "Extra Patty & Cheese", priceDelta: 299 },
  ],
};

const GROUPS_BY_CATEGORY: Record<string, OptionGroupDef[]> = {
  "beef-burgers": [MEAL, ADD_ON],
  "chicken-burgers": [MEAL, ADD_ON],
  wraps: [MEAL],
};

export function extraOptionGroups(item: MenuItem): OptionGroupDef[] {
  return GROUPS_BY_CATEGORY[item.categoryId] ?? [];
}
