import { authorizedFetch } from "@/lib/supabase/authorized-fetch";

/**
 * Removes this browser's push subscription, on GSPS's side and the browser's,
 * before signing out, so the next person on a shared device doesn't receive
 * the member's alerts (which carry entry, stop and target). Never holds up the
 * sign-out: it gives up after two seconds and swallows every error.
 */
export async function forgetThisBrowserPush(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const work = (async () => {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await authorizedFetch("/api/notifications/push-subscription", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => false);
  })().catch(() => undefined);
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 2000))]);
}
