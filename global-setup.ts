import { request } from '@playwright/test';

type LoginPayload = { access_token?: string; user?: { email?: string } };

export default async function globalSetup(): Promise<void> {
  if (process.env.E2E_SKIP_HEALTHCHECK === '1') return;

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:4200';
  const backendUrl = process.env.BACKEND_URL ?? 'http://127.0.0.1:80';
  const sentinelEmail = process.env.E2E_SENTINEL_EMAIL ?? 'e2e-doc027-sentinel@xbri.com.br';
  const sentinelPassword = process.env.E2E_SENTINEL_PASSWORD ?? 'wrong-password';
  const client = await request.newContext();

  try {
    const [frontend, backend] = await Promise.all([
      client.get(frontendUrl),
      client.get(`${backendUrl}/api/v1/vehicle/brands`),
    ]);

    if (!frontend.ok()) {
      throw new Error(`Frontend indisponivel em ${frontendUrl}: HTTP ${frontend.status()}`);
    }
    if (!backend.ok()) {
      throw new Error(`Backend indisponivel em ${backendUrl}/api/v1/vehicle/brands: HTTP ${backend.status()}`);
    }

    const login = await client.post(`${backendUrl}/api/v1/auth/login/`, {
      data: { email: sentinelEmail, password: sentinelPassword },
      headers: { 'X-Recaptcha': 'doc-dev-027-healthcheck' },
    });
    const payload = (await login.json().catch(() => ({}))) as LoginPayload;
    if (!login.ok() || !payload.access_token) {
      throw new Error(
        `Conta sentinela ${sentinelEmail} nao autenticou no backend ${backendUrl}. ` +
          'Confirme que o seeder DOC-DEV-027 e o servidor usam o mesmo banco.',
      );
    }
  } finally {
    await client.dispose();
  }
}
