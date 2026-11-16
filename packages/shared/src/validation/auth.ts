import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginDto = z.infer<typeof loginSchema>;

/** How the web app signs users in; served by `GET /auth/config`. */
export type AuthClientConfig =
  | { provider: 'local' }
  | { provider: 'entra'; tenantId: string; clientId: string; scopes: string[] };
