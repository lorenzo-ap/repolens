"use client";

import { Command } from "cmdk";
import {
  FolderGit2,
  GitBranch,
  History,
  Home,
  LayoutDashboard,
  ListChecks,
  Network,
  Package,
  Search,
  Settings,
  Sigma,
  Sparkles,
  TestTube2,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog as RDialog } from "radix-ui";
import { useEffect, useState } from "react";
import { Kbd } from "@/components/ui/input";
import { ScoreText } from "@/components/ui/score";
import { useMe, useOwnRepositories } from "@/lib/queries";

const OPEN_EVENT = "repolens:command-palette";

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

function repoBase(pathname: string): string | null {
  const m = /^\/r\/([^/]+)\/([^/]+)/.exec(pathname);
  return m ? `/r/${m[1]}/${m[2]}` : null;
}

const REPO_PAGES = [
  { path: "", label: "Overview", icon: LayoutDashboard },
  { path: "/findings", label: "Findings", icon: ListChecks },
  { path: "/architecture", label: "Architecture", icon: Network },
  { path: "/dependencies", label: "Dependencies", icon: Package },
  { path: "/testing", label: "Testing", icon: TestTube2 },
  { path: "/complexity", label: "Complexity", icon: Sigma },
  { path: "/git", label: "Git history", icon: GitBranch },
  { path: "/analyses", label: "Analyses", icon: History },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const repos = useOwnRepositories(Boolean(me.data?.user) && open);
  const base = repoBase(pathname);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <RDialog.Root open={open} onOpenChange={setOpen}>
      <RDialog.Portal>
        <RDialog.Overlay className="anim-fade fixed inset-0 z-50 bg-black/30" />
        <RDialog.Content className="anim-rise fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-bg shadow-lg focus:outline-none">
          <RDialog.Title className="sr-only">Command palette</RDialog.Title>
          <RDialog.Description className="sr-only">
            Jump to pages and repositories
          </RDialog.Description>
          <Command label="Command palette" loop>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-fg-tertiary" aria-hidden />
              <Command.Input
                placeholder="Jump to a page or repository…"
                className="h-11 w-full bg-transparent text-sm text-fg placeholder:text-fg-tertiary focus:outline-none"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="scrollbar-thin max-h-[50vh] overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
              <Command.Empty className="px-3 py-8 text-center text-sm text-fg-secondary">
                No results.
              </Command.Empty>
              {base ? (
                <Command.Group heading="This repository">
                  {REPO_PAGES.map((p) => (
                    <Item key={p.path} onSelect={() => go(`${base}${p.path}`)} icon={p.icon}>
                      {p.label}
                    </Item>
                  ))}
                </Command.Group>
              ) : null}
              <Command.Group heading="Pages">
                <Item onSelect={() => go("/")} icon={Home}>
                  Home
                </Item>
                <Item onSelect={() => go("/demo")} icon={Sparkles}>
                  Demo repository
                </Item>
                {me.data?.user ? (
                  <>
                    <Item onSelect={() => go("/repos")} icon={FolderGit2}>
                      Repositories
                    </Item>
                    <Item onSelect={() => go("/settings")} icon={Settings}>
                      Settings
                    </Item>
                  </>
                ) : null}
              </Command.Group>
              {repos.data?.repositories.length ? (
                <Command.Group heading="Your repositories">
                  {repos.data.repositories.map((r) => (
                    <Item
                      key={r.repository.id}
                      onSelect={() => go(`/r/${r.repository.owner}/${r.repository.name}`)}
                      icon={FolderGit2}
                      value={`repo ${r.repository.fullName}`}
                    >
                      <span className="font-mono text-xs">{r.repository.fullName}</span>
                      <ScoreText
                        score={r.latestAnalysis?.healthScore ?? null}
                        className="ml-auto text-xs"
                      />
                    </Item>
                  ))}
                </Command.Group>
              ) : null}
            </Command.List>
            <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-2xs text-fg-tertiary">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd> open
              </span>
            </div>
          </Command>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

function Item({
  children,
  onSelect,
  icon: Icon,
  value,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  icon: typeof Home;
  value?: string;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-8 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-sm text-fg data-[selected=true]:bg-bg-muted"
    >
      <Icon className="size-3.5 text-fg-tertiary" aria-hidden />
      {children}
    </Command.Item>
  );
}
