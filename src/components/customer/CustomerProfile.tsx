"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Save, UserRound } from "lucide-react";
import { Card, LoadingBlock, Notice, PageHeader, inputStyles, primaryButton } from "@/components/customer/ui";
import { customerRequest } from "@/components/customer/useCustomerData";
import { FormField, describedBy } from "@/components/ui/FormField";
import { useAuth } from "@/context/AuthContext";
import { isValidName, isValidPassword, isValidPhone } from "@/lib/validation";
import type { AuthUser } from "@/types";

type Errors = Record<string, string>;

export function CustomerProfile() {
  const { user } = useAuth();
  if (!user) return <LoadingBlock label="Loading your profile…" />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Account" title="My profile" description="Keep your details up to date and change your password." />
      <div className="grid gap-6 xl:grid-cols-2">
        <DetailsForm user={user} />
        <PasswordForm />
      </div>
    </div>
  );
}

function DetailsForm({ user }: { user: AuthUser }) {
  const { updateProfile } = useAuth();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaved(false);
    const found: Errors = {};
    const nameError = isValidName(name);
    if (nameError) found.name = nameError;
    const phoneError = isValidPhone(phone);
    if (phoneError) found.phone = phoneError;
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(found.name ? "profile-name" : "profile-phone")?.focus();
      return;
    }
    setPending(true);
    const result = await updateProfile({ name, phone });
    setPending(false);
    if (result.ok) setSaved(true);
    else setErrors(result.errors);
  };

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30">
            <UserRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-bold">Personal details</h2>
            <p className="text-xs text-zinc-400">Your email address cannot be changed.</p>
          </div>
        </div>

        <FormField id="profile-email" label="Email">
          <input id="profile-email" type="email" value={user.email} readOnly disabled className={inputStyles} />
        </FormField>

        <FormField id="profile-name" label="Full name" error={errors.name}>
          <input
            id="profile-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy("profile-name", errors.name)}
            className={inputStyles}
          />
        </FormField>

        <FormField id="profile-phone" label="Phone number" error={errors.phone} hint="e.g. 0300 1234567">
          <input
            id="profile-phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setSaved(false);
            }}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={describedBy("profile-phone", errors.phone, "e.g. 0300 1234567")}
            className={inputStyles}
          />
        </FormField>

        {errors.form && <Notice tone="error">{errors.form}</Notice>}
        {saved && <Notice tone="success">Your details are saved.</Notice>}

        <button type="submit" disabled={pending} className={`${primaryButton} w-fit`}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const [values, setValues] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  const update = (key: keyof typeof values, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found: Errors = {};
    if (!values.current) found.current = "Enter your current password.";
    const nextError = isValidPassword(values.next);
    if (nextError) found.next = nextError;
    else if (values.confirm !== values.next) found.confirm = "The new passwords do not match.";
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`password-${first}`)?.focus();
      return;
    }

    setPending(true);
    const result = await customerRequest("/api/customer/password", "PATCH", values);
    setPending(false);
    if (result.ok) {
      setValues({ current: "", next: "", confirm: "" });
      setSuccess(true);
    } else {
      setErrors(result.errors ?? { form: result.error });
    }
  };

  const field = (key: keyof typeof values, label: string, autoComplete: string, hint?: string) => (
    <FormField id={`password-${key}`} label={label} error={errors[key]} hint={hint}>
      <input
        id={`password-${key}`}
        type="password"
        autoComplete={autoComplete}
        value={values[key]}
        onChange={(e) => update(key, e.target.value)}
        aria-invalid={Boolean(errors[key])}
        aria-describedby={describedBy(`password-${key}`, errors[key], hint)}
        className={inputStyles}
      />
    </FormField>
  );

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-bold">Change password</h2>
            <p className="text-xs text-zinc-400">Use at least 8 characters, with a letter and a number.</p>
          </div>
        </div>

        {errors.form && <Notice tone="error">{errors.form}</Notice>}
        {field("current", "Current password", "current-password")}
        {field("next", "New password", "new-password", "At least 8 characters, with a letter and a number")}
        {field("confirm", "Confirm new password", "new-password")}
        {success && <Notice tone="success">Your password has been changed.</Notice>}

        <button type="submit" disabled={pending} className={`${primaryButton} w-fit`}>
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>
    </Card>
  );
}
