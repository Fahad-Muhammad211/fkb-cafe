"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { adminLoginRequest, adminSignupRequest } from "@/lib/adminAuth";
import { saveAllOrders } from "@/lib/orders";
import { isValidName, isValidPassword } from "@/lib/validation";
import { FormField, describedBy, inputClass } from "@/components/ui/FormField";
import { PasswordInput } from "@/components/ui/PasswordInput";

type Errors = Record<string, string>;

// Shared full-page frame for the admin login and sign-up views.
function AuthFrame({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-zinc-950 text-white">
      <header className="flex items-center justify-between px-4 py-4 md:px-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to site
        </Link>
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <ShieldCheck className="h-4 w-4 text-[#ffd400]" aria-hidden="true" />
          Admin
        </span>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-10">
        <div className="w-full max-w-md animate-card-in">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black font-serif text-xl font-black ring-1 ring-zinc-700">
              RMS
            </span>
            <h1 className="text-3xl font-black uppercase tracking-tight">{title}</h1>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl shadow-black/40 md:p-8">{children}</div>
          <div className="mt-6 text-center text-sm text-zinc-400">{footer}</div>
        </div>
      </main>
    </div>
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
      {message}
    </p>
  );
}

// "Don't have an account? Sign Up" / "Already have an account? Login": switches views in place.
function SwitchView({ prompt, label, onClick }: { prompt: string; label: string; onClick: () => void }) {
  return (
    <>
      {prompt}{" "}
      <button type="button" onClick={onClick} className="font-semibold text-white underline-offset-4 hover:underline">
        {label}
      </button>
    </>
  );
}

const submitClass =
  "rounded-full bg-[#ffd400] px-6 py-3 text-sm font-bold text-black transition-all duration-200 hover:brightness-95 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70";

export function AdminLoginForm({ onSignUp }: { onSignUp: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found: Errors = {};
    if (!email.trim()) found.email = "Please enter your email.";
    if (!password) found.password = "Please enter your password.";
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(found.email ? "admin-login-email" : "admin-login-password")?.focus();
      return;
    }

    setPending(true);
    const result = await adminLoginRequest(email, password);
    setPending(false);
    if (result.ok) {
      setPassword("");
      // Full page load so the server guard re-checks the new session cookie. The server says where
      // this account belongs: the Admin dashboard, or the Owner dashboard for an Owner.
      // Shared browsers keep no order list from the previous staff member.
      saveAllOrders([]);
      window.location.replace(result.redirect);
    } else {
      setErrors(result.errors);
    }
  };

  return (
    <AuthFrame title="Admin Login" footer={<SwitchView prompt="Don't have an account?" label="Sign Up" onClick={onSignUp} />}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <ErrorBanner message={errors.form ?? null} />

        <FormField id="admin-login-email" label="Email" error={errors.email}>
          <input
            id="admin-login-email"
            type="email"
            autoComplete="username"
            placeholder="you@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describedBy("admin-login-email", errors.email)}
            className={inputClass}
          />
        </FormField>

        <FormField id="admin-login-password" label="Password" error={errors.password}>
          <PasswordInput
            id="admin-login-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={describedBy("admin-login-password", errors.password)}
            className={inputClass}
          />
        </FormField>

        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? "Logging in…" : "Login"}
        </button>
      </form>
    </AuthFrame>
  );
}

const EMPTY_SIGNUP = { name: "", email: "", password: "" };
type SignupValues = typeof EMPTY_SIGNUP;

// First-Admin sign-up: Full Name, Email, Password. The server only accepts it while no Admin exists and
// ADMIN_SETUP_KEY is configured in its environment. The key never appears in, or leaves for, the browser.
export function AdminSignupForm({ onLogin }: { onLogin: () => void }) {
  const [values, setValues] = useState(EMPTY_SIGNUP);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  const update = (key: keyof SignupValues, value: string) => {
    const next = { ...values, [key]: value };
    setValues(next);
    // Once the user has tried to submit, keep the messages in sync as they type.
    if (Object.keys(errors).length > 0) setErrors(validateClient(next));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found = validateClient(values);
    setErrors(found);
    const firstKey = Object.keys(found)[0];
    if (firstKey) {
      document.getElementById(`admin-signup-${firstKey}`)?.focus();
      return;
    }

    setPending(true);
    const result = await adminSignupRequest(values);
    setPending(false);
    if (result.ok) {
      setValues(EMPTY_SIGNUP);
      // The server has already signed the new Admin in (httpOnly session cookie).
      // Shared browsers keep no order list from the previous staff member.
      saveAllOrders([]);
      window.location.replace(result.redirect);
    } else {
      setErrors(result.errors);
    }
  };

  const field = (key: keyof SignupValues, label: string, type: string, autoComplete: string, placeholder?: string, hint?: string) => {
    const id = `admin-signup-${key}`;
    return (
      <FormField id={id} label={label} error={errors[key]} hint={hint}>
        {type === "password" ? (
          <PasswordInput
            id={id}
            autoComplete={autoComplete}
            placeholder={placeholder}
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
            placeholder={placeholder}
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
    <AuthFrame title="Create Admin Account" footer={<SwitchView prompt="Already have an account?" label="Login" onClick={onLogin} />}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <ErrorBanner message={errors.form ?? null} />
        {field("name", "Full Name", "text", "name")}
        {field("email", "Email", "email", "email", "you@gmail.com")}
        {field("password", "Password", "password", "new-password", undefined, "At least 8 characters, with a letter and a number")}

        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? "Creating account…" : "Create Admin Account"}
        </button>
      </form>
    </AuthFrame>
  );
}

// Shown in the Sign Up view once the first Admin exists, or while the server has signup switched off.
export function AdminSignupClosed({ reason, onLogin }: { reason: "adminExists" | "notConfigured"; onLogin: () => void }) {
  return (
    <AuthFrame title="Admin Sign Up Closed" footer={<SwitchView prompt="Already have an account?" label="Login" onClick={onLogin} />}>
      <p role="status" className="text-center text-sm text-zinc-300">
        {reason === "adminExists"
          ? "An Admin account already exists, so public Admin sign-up is closed. Ask the Admin to create an account for you."
          : "Admin sign-up is not available on this site right now."}
      </p>
    </AuthFrame>
  );
}

const GMAIL_PATTERN = /^[a-z0-9][a-z0-9.]{4,28}[a-z0-9]@gmail\.com$/;

// Client-side checks mirror the server rules; the server remains the source of truth.
function validateClient(values: SignupValues): Errors {
  const found: Errors = {};
  const name = isValidName(values.name);
  if (name) found.name = name;
  const email = values.email.trim().toLowerCase();
  if (!email) found.email = "Please enter your email.";
  else if (!GMAIL_PATTERN.test(email)) found.email = "Use a valid Gmail address ending in @gmail.com.";
  const password = isValidPassword(values.password);
  if (password) found.password = password;
  return found;
}
