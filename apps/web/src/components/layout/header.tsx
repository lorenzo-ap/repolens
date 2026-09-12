"use client";

import { Command, FolderGit2, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GithubIcon } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/overlay";
import { useLogout, useMe } from "@/lib/queries";
import { cn, isMac } from "@/lib/utils";
import { openCommandPalette } from "./command-palette";
import { ThemeToggle } from "./theme-toggle";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold text-fg", className)}>
      <span
        className="flex size-6 items-center justify-center rounded-sm bg-fg text-bg"
        aria-hidden
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <title>RepoLens</title>
          <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.75" />
          <path d="M9 9l3.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </span>
      RepoLens
    </span>
  );
}

export function Header() {
  const pathname = usePathname();
  const me = useMe();
  const logout = useLogout();
  const user = me.data?.user ?? null;
  const isDemoRoute = pathname.startsWith("/demo");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-12 w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="rounded-sm" aria-label="RepoLens home">
          <Logo />
        </Link>
        {isDemoRoute ? <DemoBadge /> : null}
        <nav className="ml-2 hidden items-center gap-1 sm:flex" aria-label="Primary">
          <Link
            href="/demo"
            className={cn(
              "rounded-sm px-2 py-1 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg",
              pathname.startsWith("/demo") && "text-fg",
            )}
          >
            Demo
          </Link>
          {user ? (
            <Link
              href="/repos"
              className={cn(
                "rounded-sm px-2 py-1 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg",
                pathname.startsWith("/repos") && "text-fg",
              )}
            >
              Repositories
            </Link>
          ) : null}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm text-fg-subtle hover:border-border-strong hover:text-fg-muted md:inline-flex"
            aria-label="Open command palette"
          >
            <Command className="size-3.5" />
            <span>Search…</span>
            <Kbd>{isMac() ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>K</Kbd>
          </button>
          <ThemeToggle />
          {me.isPending ? (
            <div className="size-8 rounded-full bg-surface-2" aria-hidden />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-full border border-border hover:border-border-strong"
                  aria-label={`Account menu for ${user.login}`}
                >
                  {user.avatarUrl ? (
                    // biome-ignore lint/performance/noImgElement: avatar from GitHub CDN; next/image adds nothing here
                    <img
                      src={user.avatarUrl}
                      alt=""
                      width={28}
                      height={28}
                      className="size-7 rounded-full"
                    />
                  ) : (
                    <span className="text-xs font-semibold uppercase">
                      {user.login.slice(0, 2)}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{user.login}</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link href="/repos">
                    <FolderGit2 /> Repositories
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => logout.mutate()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm" variant="primary">
              <a href="/api/v1/auth/github">
                <GithubIcon /> Sign in with GitHub
              </a>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
