"use client";

import type { Scoring } from "@repolens/shared";
import { CATEGORY_LABELS } from "@repolens/shared";
import { HelpCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/overlay";
import { ScoreBar, ScoreText } from "@/components/ui/score";
import { Table, TBody, Td, THead, Th, Tr } from "@/components/ui/table";
import { CATEGORY_DESCRIPTION, fmt } from "@/lib/utils";

function formatValue(v: string | number | boolean | null): string {
  if (v === null) return "n/a";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return Number.isInteger(v) ? fmt(v) : v.toFixed(2);
  return v;
}

export function ScoreBreakdown({ scoring }: { scoring: Scoring | null }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <HelpCircle /> How is this computed?
        </Button>
      </DialogTrigger>
      <SheetContent
        title="Score derivation"
        description={`Scoring model v${scoring?.version ?? "?"} · every input is computed from the repository at the analyzed commit`}
      >
        {!scoring ? (
          <p className="p-5 text-sm text-fg-muted">This analysis has no scoring document.</p>
        ) : (
          <div className="space-y-6 p-5">
            <section className="rounded-md border border-border bg-surface-2 p-3 text-sm">
              <p>
                <span className="font-semibold">Health score {scoring.healthScore}</span> = weighted
                mean of the seven category scores. Each category starts from a base score built from
                its metric inputs (points earned over points available), then loses up to 20 points
                for findings whose signal is not already an input below (hotspots, hub modules,
                FIXMEs, parameter counts, non-null density, mixed lockfiles, missing tests),
                weighted by severity and divided by codebase size.
              </p>
            </section>
            {scoring.categories.map((c) => (
              <section key={c.category}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">{CATEGORY_LABELS[c.category]}</h3>
                    <p className="text-xs text-fg-muted">{CATEGORY_DESCRIPTION[c.category]}</p>
                  </div>
                  <div className="text-right">
                    <ScoreText score={c.score} className="text-lg" />
                    <div className="text-2xs text-fg-subtle">weight {c.weight}</div>
                  </div>
                </div>
                <ScoreBar score={c.score} className="mt-2" />
                <p className="mt-2 text-xs text-fg-muted">
                  Base {c.base} − findings penalty {c.findingPenalty} ={" "}
                  <span className="tabular font-medium text-fg">{c.score}</span>
                </p>
                <div className="mt-2 rounded-md border border-border">
                  <Table>
                    <THead>
                      <tr>
                        <Th>Input</Th>
                        <Th numeric>Value</Th>
                        <Th numeric>Points</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {c.inputs.map((i) => (
                        <Tr key={i.label}>
                          <Td className="text-xs">
                            {i.label}
                            {i.note ? (
                              <span className="block text-2xs text-fg-subtle">{i.note}</span>
                            ) : null}
                          </Td>
                          <Td numeric mono>
                            {formatValue(i.value)}
                          </Td>
                          <Td numeric mono>
                            {i.points}/{i.max}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </div>
              </section>
            ))}
          </div>
        )}
      </SheetContent>
    </Dialog>
  );
}
