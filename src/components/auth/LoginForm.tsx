"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { FormField, describedBy, inputClass } from "@/components/ui/FormField";
import { isValidEmail } from "@/lib/validation";
import type { AuthErrors } from "@/lib/auth";

export function LoginForm() {
  const { user, logIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<AuthErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Already signed in: go straight to the account page.
  useEffect(() => {
    if (user) router.replace("/account");
  }, [user, router]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found: AuthErrors = {};
    const emailError = isValidEmail(email);
    if (emailError) found.email = emailError;
    if (!password) found.password = "Please enter your password.";
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(Object.keys(found)[0] === "email" ? "login-email" : "login-password")?.focus();
      return;
    }

    setSubmitting(true);
    const result = await logIn(email, password);
    setSubmitting(false);
    if (result.ok) {
      // Full page load, so the server guard sees the new session cookie. A client-side push could reuse a
      // cached "/account" prefetch that was redirected to /login while the visitor was signed out.
      window.location.replace("/account");
    } else {
      setErrors(result.errors);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md animate-card-in">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:p-8">
        <header>
          <h1 className="text-2xl font-black uppercase tracking-tight">Log in</h1>
          <p className="mt-1 text-sm text-zinc-400">Welcome back. Log in to view your orders and details.</p>
        </header>

        {errors.form && (
          <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {errors.form}
          </p>
        )}

        <FormField id="login-email" label="Email" error={errors.email}>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describedBy("login-email", errors.email)}
            className={inputClass}
          />
        </FormField>

        <FormField id="login-password" label="Password" error={errors.password}>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={describedBy("login-password", errors.password)}
            className={inputClass}
          />
        </FormField>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-[#ffd400] px-6 py-3 text-sm font-bold text-black transition-all duration-200 hover:brightness-95 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>

        <p className="text-center text-sm text-zinc-400">
          New to Restaurant Management System?{" "}
          <Link href="/signup" className="font-semibold text-white underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
        <p className="text-center text-xs text-zinc-500">Your account is kept securely on our servers.</p>
      </form>
    </div>
  );
}
