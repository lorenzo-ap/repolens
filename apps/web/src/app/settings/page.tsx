"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/feedback";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";
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
        <Skeleton className="mx-auto h-8 w-64" />
      </div>
    );
  const user = me.data.user;

  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="text-xl">Settings</h1>
      <p className="mt-1 text-sm text-fg-muted">Your session, GitHub access and data.</p>

      <Card className="mt-6">
        <CardHeader title="Account" description="Signed in through GitHub OAuth." />
        <CardBody className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            {user.avatarUrl ? (
              // biome-ignore lint/performance/noImgElement: avatar from GitHub CDN
              <img
                src={user.avatarUrl}
                alt=""
                width={40}
                height={40}
                className="size-10 rounded-full border border-border"
              />
            ) : null}
            <div>
              <p className="font-medium">{user.name ?? user.login}</p>
              <p className="font-mono text-xs text-fg-muted">@{user.login}</p>
            </div>
          </div>
          <div>
            <p className="label-caps mb-1.5">Granted GitHub scopes</p>
            <div className="flex flex-wrap gap-1">
              {me.data.scopes.length ? (
                me.data.scopes.map((s) => <Badge key={s}>{s}</Badge>)
              ) : (
                <span className="text-fg-subtle">none recorded</span>
              )}
            </div>
            <p className="mt-2 text-xs text-fg-subtle">
              <code className="font-mono">repo</code> is needed to list and clone private
              repositories and to create issues. Your token is encrypted at rest and only decrypted
              when talking to GitHub on your behalf.
            </p>
          </div>
          <div>
            <Button onClick={() => logout.mutate()} loading={logout.isPending}>
              Sign out
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card className="mt-4 border-critical/30">
        <CardHeader
          title="Delete my data"
          description="Removes your account, sessions, repositories and every analysis. The demo repository is unaffected."
        />
        <CardBody>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 /> Delete account and data
              </Button>
            </DialogTrigger>
            <DialogContent
              title="Delete everything?"
              description="This cannot be undone. Your GitHub account itself is not affected; you can revoke the OAuth app under GitHub settings."
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
        </CardBody>
      </Card>
    </div>
  );
}
