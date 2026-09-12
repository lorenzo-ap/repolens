"use client";

import { FolderGit2, LogOut, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
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

export function Logo({ className, wordmark = true }: { className?: string; wordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm font-semibold text-fg", className)}>
      <span
        className="flex size-5 items-center justify-center rounded-[5px] bg-fg text-fg-inverse"
        aria-hidden
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <title>RepoLens</title>
          <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.75" />
          <path d="M9 9l3.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </span>
      {wordmark ? <span className="tracking-[-0.01em]">RepoLens</span> : null}
    </span>
  );
}

const noop = () => () => {};
/** True once React runs on the client; keeps the first client render identical to the server. */
function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/** Slot for the repository breadcrumb; the repo shell renders into it. */
export function TopBar({
  crumb,
  children,
}: {
  crumb?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const me = useMe();
  const logout = useLogout();
  const user = me.data?.user ?? null;
  const hydrated = useHydrated();

  return (
    <header className="sticky top-0 z-40 h-[var(--topbar-h)] border-b border-border bg-bg">
      <div className="flex h-full items-center gap-2 px-4">
        <Link href="/" className="shrink-0 rounded-sm" aria-label="RepoLens home">
          <Logo />
        </Link>
        {crumb ? (
          <div className="flex min-w-0 items-center gap-2 text-sm text-fg-tertiary">
            <span aria-hidden>/</span>
            {crumb}
          </div>
        ) : null}
        <nav className="ml-3 hidden items-center gap-0.5 md:flex" aria-label="Primary">
          <TopLink href="/demo" active={pathname.startsWith("/demo")}>
            Demo
          </TopLink>
          {user ? (
            <TopLink href="/repos" active={pathname.startsWith("/repos")}>
              Repositories
            </TopLink>
          ) : null}
        </nav>
        {children}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden h-7 items-center gap-2 rounded-sm border border-border bg-bg-subtle px-2 text-xs text-fg-tertiary transition-colors hover:border-border-strong hover:text-fg-secondary md:inline-flex"
            aria-label="Open command palette"
          >
            <Search className="size-3.5" aria-hidden />
            <span>Search</span>
            <span className="flex items-center gap-0.5">
              <Kbd>{isMac() ? "⌘" : "Ctrl"}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={openCommandPalette}
            className="md:hidden"
            aria-label="Search"
          >
            <Search />
          </Button>
          <ThemeToggle />
          {!hydrated || me.isPending ? (
            <div className="size-7 rounded-full bg-bg-muted" aria-hidden />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-1 flex size-7 items-center justify-center overflow-hidden rounded-full border border-border bg-bg-muted transition-colors hover:border-border-strong"
                  aria-label={`Account menu for ${user.login}`}
                >
                  {user.avatarUrl ? (
                    // biome-ignore lint/performance/noImgElement: avatar from GitHub CDN
                    <img src={user.avatarUrl} alt="" width={28} height={28} className="size-7" />
                  ) : (
                    <span className="text-2xs font-semibold uppercase">
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
            <Button asChild size="sm" variant="primary" className="ml-1">
              <a href="/api/v1/auth/github">
                <GithubIcon /> <span className="hidden sm:inline">Connect GitHub</span>
                <span className="sm:hidden">Sign in</span>
              </a>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function TopLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-sm px-2 py-1 text-sm transition-colors",
        active ? "bg-bg-muted text-fg" : "text-fg-secondary hover:bg-bg-muted hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}
