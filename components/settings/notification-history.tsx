"use client";

import { useEffect, useState } from "react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface HistoryEntry {
  id: string;
  symbol: string;
  channel: "email" | "sms" | "push";
  status: "sent" | "failed" | "skipped_quiet_hours" | "skipped_preference";
  message: string | null;
  provider_response: string | null;
  created_at: string;
}

function statusBadge(status: HistoryEntry["status"]) {
  switch (status) {
    case "sent":
      return <Badge variant="bull">Sent</Badge>;
    case "failed":
      return <Badge variant="bear">Failed</Badge>;
    case "skipped_quiet_hours":
      return <Badge variant="muted">Quiet hours</Badge>;
    case "skipped_preference":
      return <Badge variant="muted">Below threshold</Badge>;
  }
}

/** Recent notification-send attempts — the "alert history dashboard". */
export function NotificationHistory() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    fetch("/api/notifications/history?limit=25")
      .then((res) => res.json())
      .then((body) => setEntries(body.entries ?? []))
      .catch(() => setEntries([]));
  }, []);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 className="text-sm font-medium">Recent notifications</h3>
      {entries === null ? (
        <p className="text-sm text-muted">Checking…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">No notifications sent yet.</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Time</TH>
              <TH>Symbol</TH>
              <TH>Channel</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {entries.map((entry) => (
              <TR key={entry.id}>
                <TD>{new Date(entry.created_at).toLocaleString()}</TD>
                <TD className="font-medium">{entry.symbol}</TD>
                <TD className="capitalize">{entry.channel}</TD>
                <TD>{statusBadge(entry.status)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
