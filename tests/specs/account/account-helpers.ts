import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { accountForCase, bearerHeaders, loginCustomerByApi, type CustomerAccount } from '../../support/auth.js';

export type User = {
  id: number;
  uuid: string;
  name: string | null;
  last_name: string | null;
  email: string;
  document: string | null;
  additional_document: string | null;
  tribute: string;
  newsletter: boolean;
  phone: string | null;
  addresses: Address[];
};

export type Address = {
  id: number;
  is_primary: boolean;
  street: string;
  number: string;
  district: string;
  city_name: string;
  state_uf: string;
  zipcode: string;
};

export type Vehicle = {
  id: number;
  brand: string;
  model: string;
  year: string;
  version: string;
  is_primary: boolean;
};

export type Order = {
  id: string;
  code: number;
  serial: number;
  created_at: string;
  total_value: number;
  customer: Record<string, unknown>;
  shipping: Record<string, unknown>;
  status: { status: string };
  items: Array<{ product_name: string }>;
};

export function credentials(caseId: string, testInfo: TestInfo): CustomerAccount {
  return accountForCase(caseId, testInfo.project.name);
}

export async function loginForCase(
  page: Page,
  request: APIRequestContext,
  caseId: string,
  testInfo: TestInfo,
): Promise<CustomerAccount> {
  const account = credentials(caseId, testInfo);
  await loginCustomerByApi(page, request, account);
  await openDashboard(page);
  await expect(page).toHaveURL(/\/minha-conta\/?$/);
  await expect(page.getByText('Início', { exact: true }).first()).toBeVisible();
  return account;
}

export async function apiGet<T>(page: Page, backendUrl: string, path: string): Promise<T> {
  const response = await page.request.get(`${backendUrl}${path}`, { headers: await bearerHeaders(page) });
  expect(response.ok(), `${path} deve responder com sucesso`).toBeTruthy();
  return response.json() as Promise<T>;
}

export async function currentUser(page: Page, backendUrl: string): Promise<User> {
  return (await apiGet<{ data: User }>(page, backendUrl, '/api/v1/accounts')).data;
}

export async function latestOrders(page: Page, backendUrl: string): Promise<Order[]> {
  return (await apiGet<{ data: Order[] }>(page, backendUrl, '/api/v1/customers/orders/latest?limit=2')).data;
}

export async function allOrders(page: Page, backendUrl: string): Promise<Order[]> {
  return (await apiGet<{ data: Order[] }>(page, backendUrl, '/api/v1/customers/orders?page=1')).data;
}

export async function primaryVehicle(page: Page, backendUrl: string): Promise<Vehicle> {
  return (await apiGet<{ data: Vehicle }>(page, backendUrl, '/api/v1/accounts/vehicles/primary')).data;
}

export async function openAccountTab(page: Page, name: string, path: string): Promise<void> {
  await page.locator('.tabs__item').filter({ hasText: new RegExp(`^${name}$`, 'i') }).first().click();
  await expect(page).toHaveURL(new RegExp(`/minha-conta/${path}/?$`));
}

export async function openDashboard(page: Page): Promise<void> {
  await page.goto('/minha-conta', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.my-account')).toBeVisible();
}

export async function openIdentification(page: Page): Promise<void> {
  await page.goto('/minha-conta/identificacao');
  await expect(page.getByRole('heading', { name: 'Dados de identificação' })).toBeVisible();
}

export async function openAuthentication(page: Page): Promise<void> {
  await page.goto('/minha-conta/autenticacao');
  await expect(page.getByRole('heading', { name: 'Gerenciar senha' })).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Example icon-button with a menu' }).click();
  await page.getByRole('menuitem', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(async () => (await page.context().cookies()).some((cookie) => cookie.name === 'token')).toBeFalsy();
}

export async function attemptApiLogin(
  request: APIRequestContext,
  backendUrl: string,
  account: CustomerAccount,
): Promise<number> {
  const response = await request.post(`${backendUrl}/api/v1/auth/login/`, {
    data: { email: account.email, password: account.password },
    headers: { 'X-Recaptcha': 'doc-dev-027-playwright' },
  });
  return response.status();
}

export function projectProfileData(testInfo: TestInfo): {
  name: string;
  alternateName: string;
  lastName: string;
  phone: string;
  stateRegistration: string;
} {
  const values: Record<string, { name: string; alternate: string; phone: string; ie: string }> = {
    chromium: { name: 'Cliente Chromium', alternate: 'Cliente Alternativo', phone: '11981112222', ie: '110042490114' },
    firefox: { name: 'Cliente Firefox', alternate: 'Cliente Secundario', phone: '11982223333', ie: '110042490225' },
    webkit: { name: 'Cliente Webkit', alternate: 'Cliente Reserva', phone: '11983334444', ie: '110042490336' },
  };
  const selected = values[testInfo.project.name] ?? values.chromium;
  return { name: selected.name, alternateName: selected.alternate, lastName: 'Fluxo Cadastral', phone: selected.phone, stateRegistration: selected.ie };
}

export async function fillPasswordForm(
  page: Page,
  currentPassword: string,
  newPassword: string,
  confirmation: string,
): Promise<void> {
  await page.getByLabel('Senha atual', { exact: true }).fill(currentPassword);
  await page.getByLabel('Nova senha', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirmar senha', { exact: true }).fill(confirmation);
}
