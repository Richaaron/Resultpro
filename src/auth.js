import { createAuthClient } from "@neon/auth";
import { BetterAuthReactAdapter } from "@neon/auth/react/adapters";

const authUrl = import.meta.env.VITE_NEON_AUTH_URL || import.meta.env.NEON_AUTH_BASE_URL;

export const authClient = authUrl
  ? createAuthClient(authUrl, {
      adapter: BetterAuthReactAdapter({
        fetchOptions: { credentials: "include" },
      }),
    })
  : null;

export const pendingSchoolNameKey = "aster.pending-school-name";
