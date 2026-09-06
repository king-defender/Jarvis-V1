import { rebaselineIntegrityManifest } from './integrityWatchdog';

// Run this deliberately after any trusted rebuild of desktop/ or the protected backend
// files (protected-paths.ts, approval.service.ts) - never call this from anything inside
// the backend itself, only from your own terminal.
rebaselineIntegrityManifest();
