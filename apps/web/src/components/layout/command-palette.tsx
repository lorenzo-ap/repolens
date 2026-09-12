"use client";

import { Command } from "cmdk";
import {
  FolderGit2,
  GitBranch,
  Home,
  LayoutDashboard,
  ListChecks,
  Network,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog as RDialog } from "radix-ui";
import { useEffect, useState } from "react";
import { Kbd } from "@/components/ui/input";
import { useMe, useOwnRepositories } from "@/lib/queries";

const OPEN_EVENT = "repolens:command-palette";

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

function repoBase(pathname: string): string | null {
  const m = /^\/r\/([^/]+)\/([^/]+)/.exec(pathname);
  return m ? `/r/${m[1]}/${m[2]}` : null;
}

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
        <RDialog.Overlay className="anim-fade fixed inset-0 z-50 bg-black/40" />
        <RDialog.Content className="anim-zoom fixed left-1/2 top-[15vh] z-50 w-[calc(100vw-32px)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-dialog focus:outline-none">
          <RDialog.Title className="sr-only">Command palette</RDialog.Title>
          <RDialog.Description className="sr-only">
            Jump to pages and repositories
          </RDialog.Description>
          <Command label="Command palette" loop>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-fg-subtle" aria-hidden />
              <Command.Input
                placeholder="Jump to a page or repository…"
                className="h-11 w-full bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="scrollbar-thin max-h-[50vh] overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.04em] [&_[cmdk-group-heading]]:text-fg-subtle">
              <Command.Empty className="px-3 py-8 text-center text-sm text-fg-muted">
                No results.
              </Command.Empty>
              {base ? (
                <Command.Group heading="This repository">
                  <Item onSelect={() => go(base)} icon={LayoutDashboard}>
                    Overview
                  </Item>
                  <Item onSelect={() => go(`${base}/findings`)} icon={ListChecks}>
                    Findings
                  </Item>
                  <Item onSelect={() => go(`${base}/architecture`)} icon={Network}>
                    Architecture
                  </Item>
                  <Item onSelect={() => go(`${base}/history`)} icon={GitBranch}>
                    History
                  </Item>
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
                      {r.latestAnalysis?.healthScore !== null &&
                      r.latestAnalysis?.healthScore !== undefined ? (
                        <span className="tabular ml-auto text-xs text-fg-subtle">
                          {Math.round(r.latestAnalysis.healthScore)}
                        </span>
                      ) : null}
                    </Item>
                  ))}
                </Command.Group>
              ) : null}
            </Command.List>
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
      className="flex h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-sm text-fg data-[selected=true]:bg-surface-2"
    >
      <Icon className="size-4 text-fg-subtle" aria-hidden />
      {children}
    </Command.Item>
  );
}
