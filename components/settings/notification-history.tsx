"use client";

import { useEffect, useState } from "react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { authorizedFetch } from "@/lib/supabase/authorized-fetch";

interface HistoryEntry {
  id: string;
  symbol: string;
  channel: "email" | "sms" | "push";
  status: "pending" | "sent" | "failed" | "bounced";
  error_message: string | null;
  created_at: string;
}

function statusBadge(status: HistoryEntry["status"]) {
  switch (status) {
    case "sent":
      return <Badge variant="bull">Sent</Badge>;
    case "failed":
    case "bounced":
      return <Badge variant="bear">{status === "bounced" ? "Bounced" : "Failed"}</Badge>;
    case "pending":
      return <Badge variant="muted">Pending</Badge>;
  }
}

/** Recent notification-send attempts — the "alert history dashboard". */
export function NotificationHistory() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    authorizedFetch("/api/notifications/log?limit=25")
      .then((res) => res.json())
      .then((body) => setEntries(Array.isArray(body) ? body : []))
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
