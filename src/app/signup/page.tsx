import type { Metadata } from "next";
import { PageFrame } from "@/components/layout/PageFrame";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = {
  title: "Create account | MEG Pakistan",
};

export default function SignupPage() {
  return (
    <PageFrame>
      <SignupForm />
    </PageFrame>
  );
}
