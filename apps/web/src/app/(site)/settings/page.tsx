"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/feedback";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";
import { PageHeader } from "@/components/ui/page";
import { useDeleteAccount, useLogout, useMe } from "@/lib/queries";

export default function SettingsPage() {
  const me = useMe();
  const router = useRouter();
  const logout = useLogout();
  const del = useDeleteAccount();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!me.isPending && !me.data?.user) router.replace("/?auth=required");
  }, [me.isPending, me.data, router]);

  if (!me.data?.user)
    return (
      <div className="py-16">
        <SkeletonRows rows={3} />
      </div>
    );
  const user = me.data.user;

  return (
    <div className="mx-auto max-w-2xl py-8">
      <PageHeader title="Settings" description="Your session, GitHub access and data." />

      <section className="grid gap-6 border-b border-border py-6 sm:grid-cols-[160px_minmax(0,1fr)]">
        <h2 className="text-sm font-semibold">Account</h2>
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-3">
            {user.avatarUrl ? (
              // biome-ignore lint/performance/noImgElement: avatar from GitHub CDN
              <img
                src={user.avatarUrl}
                alt=""
                width={36}
                height={36}
                className="size-9 rounded-full border border-border"
              />
            ) : null}
            <div>
              <p className="font-medium">{user.name ?? user.login}</p>
              <p className="font-mono text-xs text-fg-secondary">@{user.login}</p>
            </div>
          </div>
          <div>
            <p className="eyebrow mb-1.5">Granted GitHub scopes</p>
            <div className="flex flex-wrap gap-1">
              {me.data.scopes.length ? (
                me.data.scopes.map((s) => <Badge key={s}>{s}</Badge>)
              ) : (
                <span className="text-fg-tertiary">none recorded</span>
              )}
            </div>
            <p className="mt-2 text-xs text-fg-tertiary">
              <code className="font-mono">repo</code> is needed to list and clone private
              repositories and to create issues. Your token is encrypted at rest and only decrypted
              to talk to GitHub on your behalf.
            </p>
          </div>
          <Button onClick={() => logout.mutate()} loading={logout.isPending}>
            Sign out
          </Button>
        </div>
      </section>

      <section className="grid gap-6 py-6 sm:grid-cols-[160px_minmax(0,1fr)]">
        <h2 className="text-sm font-semibold text-critical">Delete data</h2>
        <div className="text-sm">
          <p className="text-fg-secondary">
            Removes your account, sessions, repositories and every analysis. The demo repository is
            unaffected.
          </p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="mt-3">
                <Trash2 /> Delete account and data
              </Button>
            </DialogTrigger>
            <DialogContent
              title="Delete everything?"
              description="This cannot be undone. Your GitHub account is not affected; you can revoke the OAuth app under GitHub settings."
              size="sm"
            >
              <div className="flex justify-end gap-2">
                <Button onClick={() => setOpen(false)}>Cancel</Button>
                <Button variant="destructive" loading={del.isPending} onClick={() => del.mutate()}>
                  Delete
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </section>
    </div>
  );
}
