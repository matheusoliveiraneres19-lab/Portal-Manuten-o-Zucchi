"use client";

import { AppErrorBoundary } from "@/components/common/AppErrorBoundary";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AppErrorBoundary error={error} reset={reset} />;
}
