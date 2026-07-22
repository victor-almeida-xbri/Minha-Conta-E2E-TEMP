import type { Page } from '@playwright/test';

import { defineFlowCase, expect, test } from '../../support/flow-test.js';
import {
  allOrders,
  apiGet,
  currentUser,
  loginForCase,
  openIdentification,
  projectProfileData,
  type Order,
  type User,
} from './account-helpers.js';

function profileField(page: Page, name: string) {
  const controls: Record<string, string> = {
    'E-mail': 'input[formcontrolname="email"]',
    Nome: 'input[formcontrolname="name"]',
    Sobrenome: 'input[formcontrolname="last_name"]',
    CPF: 'input[formcontrolname="cpf"]',
    CNPJ: 'input[formcontrolname="cnpj"]',
    Celular: 'input[formcontrolname="phone"]',
    'Razão Social': 'input[formcontrolname="name"]',
    'Situação do contribuinte (ICMS)': 'mat-select[formcontrolname="tribute"]',
    'Inscrição estadual': 'input[formcontrolname="additional_document"]',
  };
  return page.locator(controls[name] ?? `[formcontrolname="${name}"]`);
}

async function userFromStorage(page: Page): Promise<User> {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem('user') ?? '{}') as User);
}

defineFlowCase('MC-ET006-CT001', async ({ page, request, backendUrl, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  await openIdentification(page);
  const user = await currentUser(page, backendUrl);

  await test.step('Validar dados PF, máscara e campos editáveis/bloqueados', async () => {
    expect(user.document?.replace(/\D/g, '')).toHaveLength(11);
    await expect(profileField(page, 'E-mail')).toHaveValue(user.email);
    await expect(profileField(page, 'E-mail')).toBeDisabled();
    await expect(profileField(page, 'Nome')).toHaveValue(user.name ?? '');
    await expect(profileField(page, 'Nome')).toBeEditable();
    await expect(profileField(page, 'Sobrenome')).toHaveValue(user.last_name ?? '');
    await expect(profileField(page, 'CPF')).toBeDisabled();
    await expect(profileField(page, 'CPF')).toHaveValue(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
    await expect(profileField(page, 'Celular')).toBeEditable();
  });
});

defineFlowCase('MC-ET006-CT002', async ({ page, request, backendUrl, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  await openIdentification(page);
  const user = await currentUser(page, backendUrl);

  await test.step('Validar dados PJ, CNPJ, razão social, ICMS e inscrição estadual', async () => {
    expect(user.document?.replace(/\D/g, '')).toHaveLength(14);
    await expect(profileField(page, 'CNPJ')).toBeDisabled();
    await expect(profileField(page, 'CNPJ')).toHaveValue(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
    await expect(profileField(page, 'Razão Social')).toHaveValue(user.name ?? '');
    await expect(profileField(page, 'Razão Social')).toBeDisabled();
    await expect(profileField(page, 'Celular')).toBeEditable();
    await expect(profileField(page, 'Situação do contribuinte (ICMS)')).toBeVisible();
    if (user.tribute === 'icms-taxpayer') {
      await expect(profileField(page, 'Inscrição estadual')).toHaveValue(user.additional_document ?? '');
    }
  });
});

defineFlowCase('MC-ET006-CT003', async ({ page, request, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  await openIdentification(page);

  await test.step('Confirmar CPF e tipo cadastral indisponíveis para edição', async () => {
    await expect(profileField(page, 'CPF')).toBeDisabled();
    await expect(page.getByLabel(/Tipo de cadastro/i)).toHaveCount(0);
    await expect(profileField(page, 'Nome')).toBeEditable();
  });
});

defineFlowCase('MC-ET006-CT004', async ({ page, request, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  await openIdentification(page);

  await test.step('Confirmar CNPJ e tipo cadastral indisponíveis para edição', async () => {
    await expect(profileField(page, 'CNPJ')).toBeDisabled();
    await expect(page.getByLabel(/Tipo de cadastro/i)).toHaveCount(0);
    await expect(profileField(page, 'Celular')).toBeEditable();
  });
});

defineFlowCase('MC-ET007-CT001', async ({ page, request, backendUrl, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  await openIdentification(page);
  const before = await currentUser(page, backendUrl);
  const data = projectProfileData(testInfo);
  const nextName = before.name === data.name ? data.alternateName : data.name;

  await test.step('Alterar nome, sobrenome e telefone permitidos', async () => {
    await profileField(page, 'Nome').fill(nextName);
    await profileField(page, 'Sobrenome').fill(data.lastName);
    await profileField(page, 'Celular').fill(data.phone);
    const update = page.waitForResponse(
      (response) => /\/api\/v1\/accounts\/?$/.test(response.url()) && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Atualizar dados' }).click();
    expect((await update).ok()).toBeTruthy();
    await expect(page.getByText('Seus dados foram atualizados com sucesso!')).toBeVisible();
  });

  await test.step('Recarregar e validar persistência sem mudar CPF', async () => {
    await page.reload();
    const after = await currentUser(page, backendUrl);
    expect(after).toEqual(expect.objectContaining({
      name: nextName,
      last_name: data.lastName,
      phone: data.phone,
      document: before.document,
    }));
    expect((await userFromStorage(page)).document).toBe(before.document);
  });
});

defineFlowCase('MC-ET007-CT002', async ({ page, request, backendUrl, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  await openIdentification(page);
  const before = await currentUser(page, backendUrl);
  const data = projectProfileData(testInfo);

  await test.step('Alterar telefone, situação ICMS e inscrição estadual', async () => {
    await profileField(page, 'Celular').fill(data.phone);
    await profileField(page, 'Situação do contribuinte (ICMS)').click();
    await page.getByRole('option', { name: 'Contribuiente ICMS', exact: true }).click();
    await profileField(page, 'Inscrição estadual').fill(data.stateRegistration);
    const update = page.waitForResponse(
      (response) => /\/api\/v1\/accounts\/?$/.test(response.url()) && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Atualizar dados' }).click();
    expect((await update).ok()).toBeTruthy();
    await expect(page.getByText('Seus dados foram atualizados com sucesso!')).toBeVisible();
  });

  await test.step('Validar persistência e imutabilidade do CNPJ/razão social', async () => {
    await page.reload();
    const after = await currentUser(page, backendUrl);
    expect(after).toEqual(expect.objectContaining({
      phone: data.phone,
      tribute: 'icms-taxpayer',
      additional_document: data.stateRegistration,
      document: before.document,
      name: before.name,
    }));
  });
});

defineFlowCase('MC-ET007-CT003', async ({ page, request, backendUrl, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  await openIdentification(page);
  const before = await currentUser(page, backendUrl);
  const updates: string[] = [];
  page.on('request', (candidate) => {
    if (/\/api\/v1\/accounts\/?$/.test(candidate.url()) && candidate.method() === 'PUT') updates.push(candidate.url());
  });

  await test.step('Informar telefone inválido e confirmar', async () => {
    await profileField(page, 'Celular').fill('119');
    await page.getByRole('button', { name: 'Atualizar dados' }).click();
    await expect(page.getByText('O telefone deve conter no mínimo 11 caracteres.')).toBeVisible();
  });

  await test.step('Validar ausência de atualização e dados anteriores preservados', async () => {
    expect(updates).toEqual([]);
    expect(await currentUser(page, backendUrl)).toEqual(before);
  });
});

defineFlowCase('MC-ET007-CT006', async ({ page, request, backendUrl, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  const orders = await allOrders(page, backendUrl);
  expect(orders.length, 'massa deve possuir pedido histórico').toBeGreaterThan(0);
  const order = orders[0];
  const beforeDetail = (await apiGet<{ data: Order }>(page, backendUrl, `/api/v1/orders/${order.id}`)).data;

  await test.step('Registrar snapshots do pedido e alterar o perfil', async () => {
    await page.goto(`/minha-conta/meus-pedidos/${order.id}`);
    await expect(page.getByText('Detalhes do pedido')).toBeVisible();
    const before = await currentUser(page, backendUrl);
    const data = projectProfileData(testInfo);
    await openIdentification(page);
    await profileField(page, 'Nome').fill(before.name === data.name ? data.alternateName : data.name);
    const update = page.waitForResponse(
      (response) => /\/api\/v1\/accounts\/?$/.test(response.url()) && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Atualizar dados' }).click();
    expect((await update).ok()).toBeTruthy();
  });

  await test.step('Consultar novamente e validar snapshots históricos', async () => {
    await page.goto(`/minha-conta/meus-pedidos/${order.id}`);
    await expect(page.getByText('Detalhes do pedido')).toBeVisible();
    const afterDetail = (await apiGet<{ data: Order }>(page, backendUrl, `/api/v1/orders/${order.id}`)).data;
    expect(afterDetail.customer).toEqual(beforeDetail.customer);
    expect(afterDetail.shipping).toEqual(beforeDetail.shipping);
    expect(afterDetail.items).toEqual(beforeDetail.items);
  });
});
