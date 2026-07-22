import { defineFlowCase, expect, test } from '../../support/flow-test.js';
import {
  attemptApiLogin,
  credentials,
  fillPasswordForm,
  loginForCase,
  openAuthentication,
} from './account-helpers.js';

defineFlowCase('MC-ET039-CT001', async ({ page, request, backendUrl, testInfo, testCase }) => {
  const account = credentials(testCase.id, testInfo);
  const currentPassword = account.password;

  await test.step('Autenticar com a senha controlada pelo seeder', async () => {
    await loginForCase(page, request, testCase.id, testInfo);
  });

  const newPassword = currentPassword === 'NovaSenha123' ? 'OutraSenha456' : 'NovaSenha123';
  await test.step('Alterar para nova senha válida', async () => {
    await openAuthentication(page);
    await fillPasswordForm(page, currentPassword, newPassword, newPassword);
    const response = page.waitForResponse(
      (candidate) => candidate.url().includes('/api/v1/auth/password/change') && candidate.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Atualizar dados' }).click();
    expect((await response).ok()).toBeTruthy();
    await expect(page.getByText('Seus dados foram atualizados com sucesso!')).toBeVisible();
  });

  await test.step('Validar que antiga falha e nova autentica', async () => {
    expect(await attemptApiLogin(request, backendUrl, { email: account.email, password: newPassword })).toBe(200);
    expect(await attemptApiLogin(request, backendUrl, { email: account.email, password: currentPassword })).toBe(422);
  });
});

defineFlowCase('MC-ET039-CT002', async ({ page, request, backendUrl, testInfo, testCase }) => {
  const account = await loginForCase(page, request, testCase.id, testInfo);
  await openAuthentication(page);

  await test.step('Submeter senha atual incorreta', async () => {
    const response = page.waitForResponse(
      (candidate) => candidate.url().includes('/api/v1/auth/password/change') && candidate.request().method() === 'PUT',
    );
    await fillPasswordForm(page, 'SenhaIncorreta123', 'NovaSenha123', 'NovaSenha123');
    await page.getByRole('button', { name: 'Atualizar dados' }).click();
    expect((await response).status()).toBeGreaterThanOrEqual(400);
    await expect(page.getByText('Erro ao atualizar senha.')).toBeVisible();
  });

  await test.step('Confirmar que a credencial anterior permanece válida', async () => {
    expect(await attemptApiLogin(request, backendUrl, account)).toBe(200);
  });
});

defineFlowCase('MC-ET039-CT003', async ({ page, request, backendUrl, testInfo, testCase }) => {
  const account = await loginForCase(page, request, testCase.id, testInfo);
  await openAuthentication(page);
  const attempts = [
    { value: 'Abc123', text: 'Mínimo de 8 caracteres' },
    { value: 'novasenha1', text: 'Letras maiúsculas, minúsculas e um número' },
    { value: 'NOVASENHA1', text: 'Letras maiúsculas, minúsculas e um número' },
    { value: 'NovaSenha', text: 'Letras maiúsculas, minúsculas e um número' },
  ];
  const passwordRequests: string[] = [];
  page.on('request', (candidate) => {
    if (candidate.url().includes('/api/v1/auth/password/change') && candidate.method() === 'PUT') passwordRequests.push(candidate.url());
  });

  for (const attempt of attempts) {
    await test.step(`Rejeitar ${attempt.value}`, async () => {
      await fillPasswordForm(page, account.password, attempt.value, attempt.value);
      await page.getByRole('button', { name: 'Atualizar dados' }).click();
      const rule = page.locator('.box-password-match p').filter({ hasText: attempt.text });
      await expect(rule.locator('mat-icon')).toHaveText('close');
    });
  }
  expect(passwordRequests).toEqual([]);
  expect(await attemptApiLogin(request, backendUrl, account)).toBe(200);
});

defineFlowCase('MC-ET039-CT004', async ({ page, request, backendUrl, testInfo, testCase }) => {
  const account = await loginForCase(page, request, testCase.id, testInfo);
  await openAuthentication(page);
  const passwordRequests: string[] = [];
  page.on('request', (candidate) => {
    if (candidate.url().includes('/api/v1/auth/password/change') && candidate.method() === 'PUT') passwordRequests.push(candidate.url());
  });

  await test.step('Submeter confirmação divergente', async () => {
    await fillPasswordForm(page, account.password, 'NovaSenha123', 'OutraSenha123');
    await page.getByRole('button', { name: 'Atualizar dados' }).click();
    const rule = page.locator('.box-password-match p').filter({ hasText: 'As senhas devem ser iguais' });
    await expect(rule.locator('mat-icon')).toHaveText('close');
    expect(passwordRequests).toEqual([]);
  });

  await test.step('Confirmar que a senha não foi alterada', async () => {
    expect(await attemptApiLogin(request, backendUrl, account)).toBe(200);
  });
});
