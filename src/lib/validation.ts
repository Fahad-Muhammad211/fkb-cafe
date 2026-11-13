import type { CheckoutValues } from "@/types";

export type CheckoutErrors = Partial<Record<keyof CheckoutValues, string>>;

// Pakistani mobile numbers: 03XX XXXXXXX, optionally written as +92 3XX XXXXXXX.
const PHONE_PATTERN = /^(?:\+92|0)3\d{2}[-\s]?\d{7}$/;
const NAME_PATTERN = /^[\p{L}][\p{L}\s.'-]*$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return "Please enter your name.";
  if (name.length < 2 || name.length > 60) return "Name must be between 2 and 60 characters.";
  if (!NAME_PATTERN.test(name)) return "Name can only contain letters, spaces, and . ' -";
  return undefined;
}

export function isValidPhone(value: string): string | undefined {
  const phone = value.trim();
  if (!phone) return "Please enter your phone number.";
  if (!PHONE_PATTERN.test(phone)) return "Enter a valid number, e.g. 0300 1234567.";
  return undefined;
}

export function isValidEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return "Please enter your email address.";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
  return undefined;
}

// At least 8 characters with at least one letter and one number.
export function isValidPassword(value: string): string | undefined {
  if (!value) return "Please enter a password.";
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return "Use at least one letter and one number.";
  return undefined;
}

export function validateSignupFields(values: {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirm: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = isValidName(values.name);
  if (name) errors.name = name;
  const email = isValidEmail(values.email);
  if (email) errors.email = email;
  const phone = isValidPhone(values.phone);
  if (phone) errors.phone = phone;
  const password = isValidPassword(values.password);
  if (password) errors.password = password;
  if (!password && values.confirm !== values.password) errors.confirm = "Passwords do not match.";
  return errors;
}

export function validateCheckout(values: CheckoutValues): CheckoutErrors {
  const errors: CheckoutErrors = {};

  const name = isValidName(values.name);
  if (name) errors.name = name;

  const phone = isValidPhone(values.phone);
  if (phone) errors.phone = phone;

  if (values.fulfilment === "delivery") {
    const address = values.address.trim();
    if (!address) {
      errors.address = "Please enter a delivery address.";
    } else if (address.length < 10) {
      errors.address = "Address looks too short. Include street and area.";
    } else if (address.length > 200) {
      errors.address = "Address must be 200 characters or fewer.";
    }
  }

  if (values.notes.length > 300) {
    errors.notes = "Notes must be 300 characters or fewer.";
  }

  return errors;
}
