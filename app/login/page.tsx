import Link from "next/link";
import { Suspense } from "react";
import { Brand } from "@/components/layout/brand";
import { getDataMode, supabaseConfigured } from "@/lib/config/data-mode";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  const mode = getDataMode();
  const configured = supabaseConfigured();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-card">
        <Brand />
        <h1 className="mt-6 text-lg font-semibold tracking-tight">Sign in to AdPilot AI</h1>
        <p className="mt-1 text-xs text-muted">The AI Operating System for B2B Marketing — built for SketchDeck.ai.</p>
        {configured ? (
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        ) : (
          <div className="mt-6 rounded-md border border-warning/40 bg-warning-soft p-3 text-xs">
            Supabase authentication is not configured. {mode === "demo" ? "The public demo is available without signing in." : "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable sign-in for live mode."}
            {mode === "demo" ? (
              <Link href="/" className="mt-2 block font-medium text-accent">
                Open the demo →
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
