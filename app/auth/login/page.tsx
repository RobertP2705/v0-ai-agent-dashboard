"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Brain, Mail, Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import Link from "next/link"

export default function LoginPage() {
  const [isOAuthLoading, setIsOAuthLoading] = useState<string | null>(null)
  const [isEmailLoading, setIsEmailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const handleOAuthLogin = async (provider: "google" | "github") => {
    setIsOAuthLoading(provider)
    setError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred")
      setIsOAuthLoading(null)
    }
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError("Email and password are required")
      return
    }
    setIsEmailLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      window.location.href = "/"
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid login credentials")
      setIsEmailLoading(false)
    }
  }

  const isLoading = !!isOAuthLoading || isEmailLoading

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      {/* Subtle background grid */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center gap-8">
          {/* Logo */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-[0_0_24px_rgba(34,197,94,0.2)]">
              <Brain className="h-7 w-7 text-primary-foreground" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Magi Swarm
              </h1>
              <p className="mt-1.5 font-mono text-xs text-muted-foreground/70">
                AI Agent Research Dashboard
              </p>
            </div>
          </div>

          {/* Card */}
          <div className="w-full rounded-xl border border-border/80 bg-card/80 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <h2 className="text-sm font-medium text-foreground">
                  Sign in to continue
                </h2>
              </div>

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}

              {/* OAuth Buttons */}
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => handleOAuthLogin("google")}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full gap-2"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  {isOAuthLoading === "google" ? "Redirecting..." : "Continue with Google"}
                </Button>

                <Button
                  onClick={() => handleOAuthLogin("github")}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full gap-2"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  {isOAuthLoading === "github" ? "Redirecting..." : "Continue with GitHub"}
                </Button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                  or sign in with email
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Email/Password Form */}
              <form onSubmit={handleEmailLogin} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email" className="text-xs text-foreground">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      className="pl-8 font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password" className="text-xs text-foreground">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      className="pr-8 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={isLoading} className="w-full">
                  {isEmailLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>

              <p className="text-center text-xs text-muted-foreground">
                {"Don't have an account? "}
                <Link
                  href="/auth/sign-up"
                  className="font-medium text-primary hover:underline"
                >
                  Sign up
                </Link>
              </p>
            </div>
          </div>

          <p className="font-mono text-[10px] text-muted-foreground/50">
            Authorized personnel only
          </p>
        </div>
      </div>
    </div>
  )
}
