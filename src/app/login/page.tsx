import type { Metadata } from "next";
import { PageFrame } from "@/components/layout/PageFrame";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Log in | MEG Pakistan",
};

export default function LoginPage() {
  return (
    <PageFrame>
      <LoginForm />
    </PageFrame>
  );
}
