"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { FormField, describedBy, inputClass } from "@/components/ui/FormField";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { validateSignupFields } from "@/lib/validation";
import type { AuthErrors } from "@/lib/auth";

const FIELD_IDS: Record<string, string> = {
  name: "signup-name",
  email: "signup-email",
  phone: "signup-phone",
  password: "signup-password",
  confirm: "signup-confirm",
};

export function SignupForm() {
  const { user, signUp } = useAuth();
  const router = useRouter();
  const [values, setValues] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<AuthErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) router.replace("/account");
  }, [user, router]);

  const update = (key: keyof typeof values, value: string) => {
    const next = { ...values, [key]: value };
    setValues(next);
    // Once the user has tried to submit, keep the error list in sync as they type.
    if (Object.keys(errors).length > 0) setErrors(validateSignupFields(next));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found = validateSignupFields(values);
    setErrors(found);
    const firstKey = Object.keys(found)[0];
    if (firstKey) {
      document.getElementById(FIELD_IDS[firstKey] ?? "signup-name")?.focus();
      return;
    }

    setSubmitting(true);
    const result = await signUp(values);
    setSubmitting(false);
    if (result.ok) {
      // Full page load, so the server guard sees the new session cookie (see LoginForm).
      window.location.replace("/account");
    } else {
      setErrors(result.errors);
    }
  };

  const field = (key: keyof typeof values, label: string, type: string, autoComplete: string, hint?: string) => {
    const id = FIELD_IDS[key];
    return (
      <FormField id={id} label={label} error={errors[key]} hint={hint}>
        {type === "password" ? (
          <PasswordInput
            id={id}
            autoComplete={autoComplete}
            value={values[key]}
            onChange={(e) => update(key, e.target.value)}
            aria-invalid={Boolean(errors[key])}
            aria-describedby={describedBy(id, errors[key], hint)}
            className={inputClass}
          />
        ) : (
          <input
            id={id}
            type={type}
            autoComplete={autoComplete}
            value={values[key]}
            onChange={(e) => update(key, e.target.value)}
            aria-invalid={Boolean(errors[key])}
            aria-describedby={describedBy(id, errors[key], hint)}
            className={inputClass}
          />
        )}
      </FormField>
    );
  };

  return (
    <div className="mx-auto w-full max-w-md animate-card-in">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:p-8">
        <header>
          <h1 className="text-2xl font-black uppercase tracking-tight">Create account</h1>
          <p className="mt-1 text-sm text-zinc-400">Save your details and track your orders.</p>
        </header>

        {errors.form && (
          <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {errors.form}
          </p>
        )}

        {field("name", "Full name", "text", "name")}
        {field("email", "Email", "email", "email")}
        {field("phone", "Phone number", "tel", "tel", "e.g. 0300 1234567")}
        {field("password", "Password", "password", "new-password", "At least 8 characters, with a letter and a number")}
        {field("confirm", "Confirm password", "password", "new-password")}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-[#ffd400] px-6 py-3 text-sm font-bold text-black transition-all duration-200 hover:brightness-95 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>

        <p className="text-center text-sm text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-white underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
        <p className="text-center text-xs text-zinc-500">
          Your password is never stored as plain text, only as a salted hash on our servers.
        </p>
      </form>
    </div>
  );
}
