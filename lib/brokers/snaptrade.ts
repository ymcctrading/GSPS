/**
 * SnapTrade integration — lets users link external brokerages (Webull,
 * Robinhood, Schwab, …). Feature-flagged: without env credentials every
 * endpoint reports the feature as unavailable and the UI shows "coming soon".
 */

import { Snaptrade } from "snaptrade-typescript-sdk";

export function isSnapTradeEnabled(): boolean {
  return Boolean(process.env.SNAPTRADE_CLIENT_ID && process.env.SNAPTRADE_CONSUMER_KEY);
}

export function snaptradeClient(): Snaptrade {
  if (!isSnapTradeEnabled()) {
    throw new Error("SnapTrade is not configured");
  }
  return new Snaptrade({
    clientId: process.env.SNAPTRADE_CLIENT_ID!,
    consumerKey: process.env.SNAPTRADE_CONSUMER_KEY!,
  });
}

/** Register a SnapTrade user for our app user; returns their userSecret. */
export async function registerSnapTradeUser(userId: string): Promise<string> {
  const client = snaptradeClient();
  const res = await client.authentication.registerSnapTradeUser({ userId });
  const secret = res.data.userSecret;
  if (!secret) throw new Error("SnapTrade registration returned no userSecret");
  return secret;
}

/** Generate the hosted connection-portal URL for linking a brokerage. */
export async function connectionPortalUrl(
  userId: string,
  userSecret: string,
  redirectTo: string,
): Promise<string> {
  const client = snaptradeClient();
  const res = await client.authentication.loginSnapTradeUser({
    userId,
    userSecret,
    customRedirect: redirectTo,
  });
  const data = res.data as { redirectURI?: string };
  if (!data.redirectURI) throw new Error("SnapTrade returned no portal URL");
  return data.redirectURI;
}

export async function listAccounts(userId: string, userSecret: string) {
  const client = snaptradeClient();
  const res = await client.accountInformation.listUserAccounts({ userId, userSecret });
  return res.data;
}

export async function listPositions(userId: string, userSecret: string, accountId: string) {
  const client = snaptradeClient();
  const res = await client.accountInformation.getUserAccountPositions({
    userId,
    userSecret,
    accountId,
  });
  return res.data;
}
