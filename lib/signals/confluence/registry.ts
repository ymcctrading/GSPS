/**
 * Static, in-code mirror of the `strategy_modules` DB registry
 * (`supabase/migrations/0048_gann_sara_confluence_modules.sql`) — the source
 * of truth for module identity that both the app and the audit trail read
 * from, so a module's id/version/authorized-source can never drift between
 * the code that runs it and the row that documents it.
 */

import { GANN_CONFLUENCE_MODULE } from "./gann";
import { SARA_CONFLUENCE_MODULE } from "./sara";
import type { ConfluenceModuleMeta } from "./types";

export const CONFLUENCE_MODULES: readonly ConfluenceModuleMeta[] = [
  GANN_CONFLUENCE_MODULE,
  SARA_CONFLUENCE_MODULE,
];
