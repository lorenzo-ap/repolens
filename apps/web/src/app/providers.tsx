"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { Toaster } from "sonner";
import { CommandPalette } from "@/components/layout/command-palette";
import { TooltipProvider } from "@/components/ui/overlay";
import { ApiClientError } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (count, error) => {
              if (error instanceof ApiClientError && error.status >= 400 && error.status < 500)
                return false;
              return count < 2;
            },
            refetchOnWindowFocus: false,
            staleTime: 10_000,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider>
          {children}
          <CommandPalette />
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: "!bg-surface !text-fg !border-border !shadow-popover !rounded-md !text-sm",
              duration: 5000,
            }}
          />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
