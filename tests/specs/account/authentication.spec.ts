import type { Page } from '@playwright/test';

import { defineBlockedCase, defineFlowCase, expect, test } from '../../support/flow-test.js';
import { openEmailLogin } from '../../support/auth.js';
import { expectNoServerError } from '../../support/navigation.js';
import {
  attemptApiLogin,
  credentials,
  loginForCase,
  logout,
} from './account-helpers.js';

async function fillLogin(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
}

async function submitLogin(page: Page) {
  const response = page.waitForResponse(
    (candidate) => candidate.url().includes('/api/v1/auth/login') && candidate.request().method() === 'POST',
    { timeout: 20_000 },
  );
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  return response;
}

defineFlowCase('MC-ET001-CT001', async ({ page, testInfo, testCase }) => {
  const account = credentials(testCase.id, testInfo);
  await openEmailLogin(page);

  await test.step('Logar com e-mail e senha cadastrados', async () => {
    await fillLogin(page, account.email, account.password);
    const response = await submitLogin(page);
    expect(response.ok()).toBeTruthy();
    expect(response.request().headers()['x-recaptcha']).toBeTruthy();
  });

  await test.step('Validar sucesso, fechamento do login e sessão protegida', async () => {
    await expect(page.getByText('Login feito com sucesso!')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Entrar com e-mail e senha' })).toBeHidden({ timeout: 5_000 });
    const tokenCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'token');
    expect(tokenCookie?.value).toBeTruthy();
    await page.goto('/minha-conta');
    await expect(page.locator('.my-account')).toBeVisible();
    await expectNoServerError(page);
  });
});

defineFlowCase('MC-ET001-CT002', async ({ page, testInfo, testCase }) => {
  const account = credentials(testCase.id, testInfo);
  await openEmailLogin(page);
  await fillLogin(page, account.email, 'senha-incorreta');

  await test.step('Tentar login com senha incorreta', async () => {
    expect((await submitLogin(page)).status()).toBe(422);
  });

  await test.step('Validar mensagem de falha e ausência de sessão', async () => {
    await expect(page.getByText('Usuário ou senha inválidos.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Entrar com e-mail e senha' })).toBeVisible();
    expect((await page.context().cookies()).some((cookie) => cookie.name === 'token')).toBeFalsy();
  });
});

defineBlockedCase(
  'MC-ET001-CT003',
  'A política atual exige reCAPTCHA em toda tentativa e a chave configurada rejeita localhost; não existe limiar observável de erros após o qual o desafio passe a ser solicitado.',
);

defineFlowCase('MC-ET001-CT004', async ({ page, request, backendUrl, testInfo, testCase }) => {
  const account = credentials(testCase.id, testInfo);
  await openEmailLogin(page);
  await fillLogin(page, account.email, "' OR 1=1 --");

  await test.step('Enviar SQL injection no campo senha', async () => {
    expect((await submitLogin(page)).status()).toBe(422);
    await expect(page.getByText('Usuário ou senha inválidos.')).toBeVisible();
  });

  await test.step('Confirmar que a credencial legítima permaneceu válida', async () => {
    expect(await attemptApiLogin(request, backendUrl, account)).toBe(200);
  });
});

defineFlowCase('MC-ET003-CT001', async ({ page, request, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  await page.goto('/');

  await test.step('Acessar menu do usuário e Minha conta', async () => {
    await page.getByRole('button', { name: 'Example icon-button with a menu' }).click();
    await page.getByRole('menuitem', { name: 'Minha conta', exact: true }).click();
    await expect(page).toHaveURL(/\/minha-conta\/?$/);
    await expect(page.locator('.my-account')).toBeVisible();
  });

  await test.step('Validar token armazenado em cookie seguro da sessão', async () => {
    const token = (await page.context().cookies()).find((cookie) => cookie.name === 'token');
    expect(token?.value).toBeTruthy();
    expect(token?.expires).toBeGreaterThan(Date.now() / 1000);
  });
});

defineFlowCase('MC-ET003-CT002', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/minha-conta');

  await test.step('Validar proteção da URL do dashboard', async () => {
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Acessar a conta' })).toBeVisible();
    await expect(page.locator('.my-account')).toHaveCount(0);
  });
});

defineBlockedCase(
  'MC-ET003-CT003',
  'O guard atual redireciona token inválido/expirado para a home e abre o drawer, mas não apresenta a mensagem "logar novamente" exigida pelo contrato.',
);

defineFlowCase('MC-ET003-CT004', async ({ page, request, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);

  await test.step('Acionar Sair no menu autenticado', async () => {
    await logout(page);
  });

  await test.step('Confirmar que nova tentativa exige autenticação', async () => {
    await page.goto('/minha-conta');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Acessar a conta' })).toBeVisible();
    await expect(page.locator('.my-account')).toHaveCount(0);
  });
});
