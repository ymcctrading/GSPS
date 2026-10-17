#!/usr/bin/env node
/*
 * Generates one VAPID keypair for Web Push and prints the environment
 * variables to set. Run once per deployment environment:
 *
 *   node scripts/generate-vapid-keys.mjs
 *
 * The keypair identifies GSPS as the sender to every push service (RFC 8292).
 * Rotating it invalidates every existing subscription in
 * `push_subscriptions` — each member would have to re-enable alerts on each
 * device — so generate once and keep it, rather than regenerating per deploy.
 *
 * The private key is a signing credential. It belongs only in the server-side
 * environment (`WEB_PUSH_VAPID_PRIVATE_KEY`); it must never be committed, and
 * must never be given the `NEXT_PUBLIC_` prefix, which would ship it to every
 * browser that loads the app.
 */

import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("VAPID keypair generated. Set these, then redeploy:\n");
console.log(`WEB_PUSH_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`WEB_PUSH_VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`WEB_PUSH_VAPID_SUBJECT=mailto:you@yourdomain.com`);
console.log(
  "\nThe private key is server-side only — never prefix it NEXT_PUBLIC_, and never commit it.",
);
