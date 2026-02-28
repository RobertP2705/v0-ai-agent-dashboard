"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import {
  LayoutGrid,
  MessageSquare,
  CreditCard,
  Brain,
  Activity,
  Users,
  LogOut,
  ChevronUp,
} from "lucide-react"
import type { User } from "@supabase/supabase-js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

const navItems = [
  { id: "overview", label: "Swarm Overview", icon: LayoutGrid },
  { id: "teams", label: "Teams", icon: Users },
  { id: "meeting", label: "Research Meeting Room", icon: MessageSquare },
  { id: "credits", label: "API Credits", icon: CreditCard },
]

interface SidebarNavProps {
  activeView: string
  onViewChange: (view: string) => void
}

export function SidebarNav({ activeView, onViewChange }: SidebarNavProps) {
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  const userEmail = user?.email ?? ""
  const userAvatar = user?.user_metadata?.avatar_url as string | undefined
  const userName = user?.user_metadata?.full_name as string | undefined

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
          <Brain className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-sidebar-foreground">
            Swarm Lab
          </h1>
          <p className="font-mono text-[10px] text-muted-foreground">
            v3.0.0
          </p>
        </div>
      </div>

      <nav className="flex flex-col gap-1 p-3">
        <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Navigation
        </p>
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeView === item.id
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-primary font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto border-t border-border p-3">
        <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2">
          <Activity className="h-3.5 w-3.5 text-success" />
          <div>
            <p className="text-xs font-medium text-sidebar-foreground">
              System Online
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              Qwen3-32B on A100
            </p>
          </div>
        </div>

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="mt-2 flex w-full items-center gap-2.5 rounded-md border border-border px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent/50"
                aria-label="Account menu"
              >
                <Avatar className="h-7 w-7 shrink-0">
                  {userAvatar ? (
                    <AvatarImage
                      src={userAvatar}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                  <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">
                    {(userName || userEmail || "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  {userName && (
                    <p className="truncate text-xs font-medium text-sidebar-foreground">
                      {userName}
                    </p>
                  )}
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {userEmail}
                  </p>
                </div>
                <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              sideOffset={8}
              className="w-[216px]"
            >
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  {userName && (
                    <p className="text-sm font-medium leading-none">{userName}</p>
                  )}
                  <p className="text-xs leading-none text-muted-foreground">
                    {userEmail}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={handleSignOut}
                className="cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </aside>
  )
}
