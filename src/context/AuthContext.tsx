"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchCurrentUser,
  logInRequest,
  logOutRequest,
  signUpRequest,
  updateProfileRequest,
  type AuthResult,
  type LogInResult,
} from "@/lib/auth";
import type { AuthUser } from "@/types";

interface AuthContextValue {
  // undefined while the saved session is still loading on the client.
  user: AuthUser | null | undefined;
  signUp: (input: { name: string; email: string; phone: string; password: string; confirm: string }) => Promise<AuthResult>;
  logIn: (email: string, password: string) => Promise<LogInResult>;
  logOut: () => void;
  updateProfile: (values: { name: string; phone: string }) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Accounts and sessions live on the server (MongoDB). This provider only keeps the signed-in
// user in memory, so pages can show the right state.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    fetchCurrentUser().then((found) => {
      if (active) setUser(found);
    });
    return () => {
      active = false;
    };
  }, []);

  const signUp = useCallback(async (input: Parameters<AuthContextValue["signUp"]>[0]) => {
    const result = await signUpRequest(input);
    if (result.ok) setUser(result.user);
    return result;
  }, []);

  const logIn = useCallback(async (email: string, password: string) => {
    const result = await logInRequest(email, password);
    // An owner login does not sign in a customer, so the customer user stays as it is.
    if (result.ok && "user" in result) setUser(result.user);
    return result;
  }, []);

  const logOut = useCallback(() => {
    setUser(null);
    void logOutRequest();
  }, []);

  const updateProfile = useCallback(async (values: { name: string; phone: string }) => {
    const result = await updateProfileRequest(values);
    if (result.ok) setUser(result.user);
    return result;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, signUp, logIn, logOut, updateProfile }),
    [user, signUp, logIn, logOut, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
