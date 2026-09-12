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

export function ScoreBreakdown({
  scoring,
  trigger,
}: {
  scoring: Scoring | null;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="ghost">
            <HelpCircle /> How is this computed?
          </Button>
        )}
      </DialogTrigger>
      <SheetContent
        title="Score derivation"
        description={`model v${scoring?.version ?? "?"}`}
        width="max-w-[600px]"
      >
        {!scoring ? (
          <p className="p-5 text-sm text-fg-secondary">This analysis has no scoring document.</p>
        ) : (
          <div className="p-5">
            <p className="text-sm leading-6 text-fg-secondary">
              <span className="font-semibold text-fg">Health score {scoring.healthScore}</span> is
              the weighted mean of seven category scores. Each category earns points from measured
              inputs (points earned over points available), then loses up to 20 points for findings
              whose signal is not already one of those inputs, weighted by severity and divided by
              codebase size. Every input below is computed from the repository at the analyzed
              commit.
            </p>
            <div className="mt-6 space-y-7">
              {scoring.categories.map((c) => (
                <section key={c.category}>
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-fg">
                        {CATEGORY_LABELS[c.category]}
                      </h3>
                      <p className="text-xs text-fg-tertiary">{CATEGORY_DESCRIPTION[c.category]}</p>
                    </div>
                    <div className="text-right">
                      <ScoreText score={c.score} className="text-lg" />
                      <div className="text-2xs text-fg-tertiary">weight {c.weight}</div>
                    </div>
                  </div>
                  <ScoreBar score={c.score} className="mt-2" />
                  <p className="tabular mt-1.5 text-xs text-fg-tertiary">
                    base {c.base} − penalty {c.findingPenalty} ={" "}
                    <span className="font-medium text-fg-secondary">{c.score}</span>
                  </p>
                  <div className="mt-2 overflow-hidden rounded-md border border-border">
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
                            <Td className="h-8 text-xs">
                              {i.label}
                              {i.note ? (
                                <span className="block text-2xs text-fg-tertiary">{i.note}</span>
                              ) : null}
                            </Td>
                            <Td numeric mono className="h-8">
                              {formatValue(i.value)}
                            </Td>
                            <Td numeric mono className="h-8 text-fg-secondary">
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
          </div>
        )}
      </SheetContent>
    </Dialog>
  );
}
