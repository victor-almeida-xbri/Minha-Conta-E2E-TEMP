import { expect, type APIRequestContext, type Page } from '@playwright/test';

export type CustomerAccount = { email: string; password: string };

type LoginResponse = {
  access_token: string;
  expired_at: string;
  user: { id: string; name: string; last_name: string; email: string; [key: string]: unknown };
};

export function accountForCase(caseId: string, projectName: string): CustomerAccount {
  const browser = ['chromium', 'firefox', 'webkit'].includes(projectName) ? projectName : 'chromium';
  const password = process.env.E2E_SENTINEL_PASSWORD;

  if (!password) {
    throw new Error('E2E_SENTINEL_PASSWORD deve ser definida no arquivo .env.');
  }

  return {
    email: `e2e-doc027-${caseId.toLowerCase()}-${browser}@xbri.com.br`,
    password,
  };
}

async function installRecaptchaMock(page: Page): Promise<void> {
  await page.route(/https:\/\/www\.google\.com\/recaptcha\/api\.js(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `(() => {
        const widgets = new Map();
        let nextWidget = 0;
        window.grecaptcha = {
          render: (_element, options) => {
            const id = nextWidget++;
            widgets.set(id, options);
            return id;
          },
          execute: (id) => Promise.resolve().then(() => {
            widgets.get(id)?.callback?.('doc-dev-027-playwright');
          }),
          reset: () => undefined,
          getResponse: () => 'doc-dev-027-playwright',
        };
        window.ng2recaptchaloaded?.();
      })();`,
    });
  });
}

async function installBackendHostBridge(page: Page): Promise<void> {
  await page.route(/^http:\/\/localhost(?::80)?\/api\//, async (route) => {
    const target = new URL(route.request().url());
    target.hostname = '127.0.0.1';
    target.port = '80';
    try {
      const response = await route.fetch({ url: target.toString() });
      await route.fulfill({ response });
    } catch (error) {
      if (!String(error).includes('Test ended') && !String(error).includes('Target page')) throw error;
    }
  });
}

export async function openEmailLogin(page: Page): Promise<void> {
  await installRecaptchaMock(page);
  await installBackendHostBridge(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Sua conta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acessar a conta', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar com e-mail e senha', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entrar com e-mail e senha', exact: true })).toBeVisible();
}

export async function loginCustomer(page: Page, account: CustomerAccount): Promise<void> {
  await openEmailLogin(page);
  await page.getByLabel('E-mail', { exact: true }).fill(account.email);
  await page.getByLabel('Senha', { exact: true }).fill(account.password);
  const loginResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/auth/login') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  expect((await loginResponse).ok()).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Sua conta', exact: true })).toBeVisible();
}

export async function loginCustomerByApi(
  page: Page,
  request: APIRequestContext,
  account: CustomerAccount,
): Promise<LoginResponse> {
  const backendUrl = process.env.BACKEND_URL ?? 'http://127.0.0.1:80';
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:4200';
  const response = await request.post(`${backendUrl}/api/v1/auth/login/`, {
    data: { email: account.email, password: account.password },
    headers: { 'X-Recaptcha': 'doc-dev-027-playwright' },
  });
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as LoginResponse;
  expect(payload.access_token).toBeTruthy();

  const accountResponse = await request.get(`${backendUrl}/api/v1/accounts`, {
    headers: { Authorization: `Bearer ${payload.access_token}` },
  });
  expect(accountResponse.ok()).toBeTruthy();
  const accountPayload = (await accountResponse.json()) as { data: LoginResponse['user'] };

  await installBackendHostBridge(page);

  await page.context().addCookies([
    {
      name: 'token',
      value: payload.access_token,
      url: frontendUrl,
      expires: Math.floor(new Date(payload.expired_at).getTime() / 1000),
    },
  ]);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((user) => window.localStorage.setItem('user', JSON.stringify(user)), accountPayload.data);
  return payload;
}

export async function bearerHeaders(page: Page): Promise<{ Authorization: string }> {
  const token = (await page.context().cookies()).find((cookie) => cookie.name === 'token')?.value;
  expect(token, 'token autenticado deve existir no contexto do navegador').toBeTruthy();
  return { Authorization: `Bearer ${token}` };
}
