import { type Locator, type Page } from '@playwright/test';
import { accountForCase, bearerHeaders, loginCustomerByApi } from '../../support/auth.js';
import { defineFlowCase, expect, test, type FlowContext } from '../../support/flow-test.js';

type Address = {
  id: number;
  is_primary: boolean;
  user_id: number;
  city_code: number;
  city_name: string;
  state_name: string;
  state_uf: string;
  zipcode: string;
  street: string;
  number: string;
  district: string;
  complement: string | null;
  created_at: string;
  updated_at: string;
};

type AddressData = Pick<Address, 'zipcode' | 'street' | 'number' | 'district' | 'complement'> & {
  city_name: string;
  state_uf: string;
  city_code: number;
};

function addressFor(caseId: string): AddressData {
  const suffix = Number(caseId.replace(/\D/g, '').slice(-3)) || 1;
  return {
    zipcode: '01310-100',
    street: `Avenida E2E ${caseId}`,
    number: String(100 + suffix),
    district: 'Bela Vista',
    complement: 'Conjunto Playwright',
    city_name: 'São Paulo',
    state_uf: 'SP',
    city_code: 3550308,
  };
}

async function loginAndOpenAddresses(context: FlowContext): Promise<void> {
  await loginCustomerByApi(
    context.page,
    context.request,
    accountForCase(context.testCase.id, context.testInfo.project.name),
  );
  await openAddresses(context.page);
}

async function openAddresses(page: Page): Promise<void> {
  await page.goto('/minha-conta/meus-enderecos');
  await expect(page.getByText(/Endereços cadastrados|Nenhum endereço cadastrado/)).toBeVisible();
}

async function readAddresses(page: Page, backendUrl: string): Promise<Address[]> {
  const response = await page.request.get(`${backendUrl}/api/v1/accounts`, { headers: await bearerHeaders(page) });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { data: { addresses: Address[] } }).data.addresses;
}

function addressRow(page: Page, address: Pick<Address, 'street' | 'number'>): Locator {
  return page.locator('.box-address').filter({ hasText: `${address.street}, ${address.number}` }).first();
}

async function openAddressMenu(page: Page, row: Locator): Promise<Locator> {
  await row.getByRole('button', { name: 'Opções de ação para endereço' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}

async function openNewAddress(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Adicionar endereço' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Novo endereço' })).toBeVisible();
  return dialog;
}

async function openEditAddress(page: Page, address: Address): Promise<Locator> {
  const menu = await openAddressMenu(page, addressRow(page, address));
  await menu.getByText('Editar', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Editar endereço' })).toBeVisible();
  return dialog;
}

async function mockViaCep(page: Page, address: AddressData): Promise<void> {
  await page.route(`**/ws/${address.zipcode.replace(/\D/g, '')}/json/`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        cep: address.zipcode,
        logradouro: address.street,
        complemento: '',
        bairro: address.district,
        localidade: address.city_name,
        uf: address.state_uf,
        ibge: String(address.city_code),
      }),
    });
  });
}

async function mockMissingCep(page: Page, zipcode: string): Promise<void> {
  await page.route(`**/ws/${zipcode.replace(/\D/g, '')}/json/`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ erro: true }) });
  });
}

async function fillCep(dialog: Locator, address: AddressData): Promise<void> {
  await dialog.getByLabel('CEP').fill(address.zipcode);
  await expect(dialog.getByText(`${address.street} - ${address.district}, ${address.city_name} - ${address.state_uf}`)).toBeVisible();
}

async function fillAddress(dialog: Locator, address: AddressData): Promise<void> {
  await fillCep(dialog, address);
  await dialog.getByLabel('Número').fill(address.number);
  await dialog.getByLabel('Complemento').fill(address.complement ?? '');
}

async function submitAddress(page: Page, dialog: Locator, method: 'POST' | 'PUT') {
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/v1/accounts/addresses') && response.request().method() === method,
  );
  await dialog.getByRole('button', { name: /cadastrar endereço|salvar/i }).click();
  return responsePromise;
}

async function deleteAddress(page: Page, address: Address): Promise<void> {
  const menu = await openAddressMenu(page, addressRow(page, address));
  await menu.getByText('Excluir', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Tem certeza que deseja excluir esse endereço?')).toBeVisible();
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes(`/api/v1/accounts/addresses/${address.id}`) && response.request().method() === 'DELETE',
  );
  await dialog.getByRole('button', { name: 'Sim', exact: true }).click();
  expect((await responsePromise).status()).toBe(204);
}

async function orderAddressSnapshot(page: Page): Promise<string> {
  await page.goto('/minha-conta/meus-pedidos');
  const order = page.locator('.box-orders-info').first();
  await expect(order).toBeVisible();
  await order.click();
  await expect(page.getByText('Detalhes do pedido', { exact: true })).toBeVisible();
  const delivery = page.locator('.order-details__addresses');
  await expect(delivery).toBeVisible();
  return (await delivery.innerText()).replace(/\s+/g, ' ').trim();
}

defineFlowCase('MC-ET014-CT001', async (context) => {
  await loginAndOpenAddresses(context);
  await expect(context.page.getByText('Nenhum endereço cadastrado')).toBeVisible();
  await expect(context.page.getByRole('button', { name: 'Adicionar endereço' })).toBeVisible();
  await expect(context.page.locator('.box-address')).toHaveCount(0);
});

defineFlowCase('MC-ET014-CT002', async (context) => {
  await loginAndOpenAddresses(context);
  const addresses = await readAddresses(context.page, context.backendUrl);
  expect(addresses.length).toBeGreaterThanOrEqual(2);
  await expect(context.page.locator('.box-address')).toHaveCount(addresses.length);
  await expect(context.page.getByText('Endereço principal')).toHaveCount(1);
  expect(addresses.filter((address) => address.is_primary)).toHaveLength(1);
});

defineFlowCase('MC-ET015-CT001', async (context) => {
  const address = addressFor(context.testCase.id);
  await mockViaCep(context.page, address);
  await loginAndOpenAddresses(context);
  const countBefore = (await readAddresses(context.page, context.backendUrl)).length;
  const dialog = await openNewAddress(context.page);
  await fillCep(dialog, address);
  await expect(dialog.getByLabel('Número')).toBeEditable();
  await expect(dialog.getByLabel('Complemento')).toBeEditable();
  expect((await readAddresses(context.page, context.backendUrl)).length).toBe(countBefore);
});

defineFlowCase('MC-ET015-CT002', async (context) => {
  const zipcode = '99999-999';
  await mockMissingCep(context.page, zipcode);
  await loginAndOpenAddresses(context);
  const countBefore = (await readAddresses(context.page, context.backendUrl)).length;
  const dialog = await openNewAddress(context.page);
  await dialog.getByLabel('CEP').fill(zipcode);
  await expect(dialog.getByText('Não encontramos seu CEP, tente outro.')).toBeVisible();
  expect((await readAddresses(context.page, context.backendUrl)).length).toBe(countBefore);
});

defineFlowCase('MC-ET015-CT003', async (context) => {
  let calls = 0;
  await context.page.route('**/viacep.com.br/**', async (route) => {
    calls += 1;
    await route.abort();
  });
  await loginAndOpenAddresses(context);
  const dialog = await openNewAddress(context.page);
  await dialog.getByLabel('CEP').fill('1234');
  await dialog.getByRole('button', { name: 'cadastrar endereço' }).click();
  await expect(dialog.getByText('Informe um CEP válido (00000-000).')).toBeVisible();
  expect(calls).toBe(0);
});

defineFlowCase('MC-ET015-CT004', async (context) => {
  const zipcode = '01310-100';
  let lookupCalls = 0;
  await context.page.route(`**/ws/${zipcode.replace(/\D/g, '')}/json/`, async (route) => {
    lookupCalls += 1;
    await route.abort('failed');
  });
  await loginAndOpenAddresses(context);
  const countBefore = (await readAddresses(context.page, context.backendUrl)).length;
  const dialog = await openNewAddress(context.page);

  await dialog.getByLabel('CEP').fill(zipcode);

  await expect.poll(() => lookupCalls, 'a consulta ao ViaCEP deve ser executada').toBeGreaterThan(0);
  expect((await readAddresses(context.page, context.backendUrl)).length).toBe(countBefore);
  await expect(
    context.page.getByText(/Consulta indisponível, tente novamente mais tarde\.?/i),
    'deve apresentar uma mensagem coerente com a indisponibilidade da consulta de CEP',
  ).toBeVisible();
});

defineFlowCase('MC-ET015-CT005', async (context) => {
  const address = addressFor(context.testCase.id);
  await mockViaCep(context.page, address);
  await loginAndOpenAddresses(context);
  const countBefore = (await readAddresses(context.page, context.backendUrl)).length;
  const dialog = await openNewAddress(context.page);
  await fillCep(dialog, address);
  await dialog.getByRole('button', { name: 'cadastrar endereço' }).click();
  await expect(dialog.getByText('O número é obrigatório.')).toBeVisible();
  expect((await readAddresses(context.page, context.backendUrl)).length).toBe(countBefore);
});

defineFlowCase('MC-ET015-CT006', async (context) => {
  await loginAndOpenAddresses(context);
  const addressesBefore = await readAddresses(context.page, context.backendUrl);
  expect(addressesBefore, 'a massa deve possuir exatamente o endereço ativo que será repetido').toHaveLength(1);
  const existingAddress = addressesBefore[0];

  await mockViaCep(context.page, existingAddress);
  const dialog = await openNewAddress(context.page);
  await fillAddress(dialog, existingAddress);
  const response = await submitAddress(context.page, dialog, 'POST');

  expect(
    response.ok(),
    `o backend deve rejeitar o endereço duplicado, mas respondeu HTTP ${response.status()}`,
  ).toBe(false);
  await expect(
    dialog.getByText(/endereço já cadastrado/i),
    'deve apresentar uma mensagem específica para endereço já cadastrado',
  ).toBeVisible();

  const addressesAfter = await readAddresses(context.page, context.backendUrl);
  expect(addressesAfter, 'nenhum novo registro deve ser criado').toHaveLength(addressesBefore.length);
  expect(
    addressesAfter.map((address) => address.id),
    'o registro original deve ser preservado sem substituição',
  ).toEqual(addressesBefore.map((address) => address.id));
});

defineFlowCase('MC-ET015-CT007', async (context) => {
  const address = addressFor(context.testCase.id);
  await mockViaCep(context.page, address);
  await loginAndOpenAddresses(context);
  const countBefore = (await readAddresses(context.page, context.backendUrl)).length;
  const dialog = await openNewAddress(context.page);
  await fillAddress(dialog, address);
  expect((await submitAddress(context.page, dialog, 'POST')).status()).toBe(200);
  await expect(addressRow(context.page, address)).toBeVisible();
  expect((await readAddresses(context.page, context.backendUrl)).length).toBe(countBefore + 1);
});

defineFlowCase('MC-ET015-CT008', async (context) => {
  const address = addressFor(context.testCase.id);
  await mockViaCep(context.page, address);
  await loginAndOpenAddresses(context);
  expect(await readAddresses(context.page, context.backendUrl)).toHaveLength(0);
  const dialog = await openNewAddress(context.page);
  await fillAddress(dialog, address);
  expect((await submitAddress(context.page, dialog, 'POST')).status()).toBe(200);
  const addresses = await readAddresses(context.page, context.backendUrl);
  expect(addresses).toHaveLength(1);
  expect(addresses[0].is_primary).toBe(true);
  await expect(addressRow(context.page, address).getByText('Endereço principal')).toBeVisible();
});

defineFlowCase('MC-ET015-CT012', async (context) => {
  const address = addressFor(context.testCase.id);
  await mockViaCep(context.page, address);
  await loginAndOpenAddresses(context);
  const addressesBefore = await readAddresses(context.page, context.backendUrl);
  expect(addressesBefore).toHaveLength(1);
  const principalBefore = addressesBefore.find((candidate) => candidate.is_primary);
  expect(principalBefore).toBeTruthy();

  const dialog = await openNewAddress(context.page);
  await fillAddress(dialog, address);
  const response = await submitAddress(context.page, dialog, 'POST');
  expect(response.ok()).toBeTruthy();

  const addressesAfter = await readAddresses(context.page, context.backendUrl);
  const created = addressesAfter.find(
    (candidate) => candidate.street === address.street && candidate.number === address.number,
  );

  expect(addressesAfter).toHaveLength(addressesBefore.length + 1);
  expect(created).toBeTruthy();
  expect(
    addressesAfter.filter((candidate) => candidate.is_primary),
    'deve permanecer exatamente um endereço principal',
  ).toHaveLength(1);
  expect(
    addressesAfter.find((candidate) => candidate.is_primary)?.id,
    'o endereço principal anterior deve ser preservado',
  ).toBe(principalBefore!.id);
  expect(created!.is_primary, 'o novo endereço deve ser cadastrado como secundário').toBe(false);
  await expect(addressRow(context.page, principalBefore!).getByText('Endereço principal')).toBeVisible();
});

defineFlowCase('MC-ET016-CT001', async (context) => {
  await loginAndOpenAddresses(context);
  const [address] = await readAddresses(context.page, context.backendUrl);
  expect(address).toBeTruthy();
  const dialog = await openEditAddress(context.page, address);
  const formattedZipcode = address.zipcode.replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
  await expect(dialog.getByLabel('CEP')).toHaveValue(formattedZipcode);
  await expect(dialog.getByLabel('Número')).toHaveValue(address.number);
  await expect(dialog.getByLabel('Complemento')).toHaveValue(address.complement ?? '');
  expect((await readAddresses(context.page, context.backendUrl)).find((candidate) => candidate.id === address.id)).toEqual(address);
});

defineFlowCase('MC-ET016-CT002', async (context) => {
  await loginAndOpenAddresses(context);
  const [address] = await readAddresses(context.page, context.backendUrl);
  expect(address).toBeTruthy();
  const updated = {
    ...addressFor(context.testCase.id),
    zipcode: address.zipcode.replace(/\D/g, '') === '20040020' ? '01310-100' : '20040-020',
  };
  await mockViaCep(context.page, updated);
  const dialog = await openEditAddress(context.page, address);
  await fillAddress(dialog, updated);
  expect((await submitAddress(context.page, dialog, 'PUT')).ok()).toBeTruthy();
  await expect(addressRow(context.page, updated)).toBeVisible();
  expect((await readAddresses(context.page, context.backendUrl)).find((candidate) => candidate.id === address.id)).toEqual(
    expect.objectContaining({
      zipcode: updated.zipcode.replace(/\D/g, ''),
      street: updated.street,
      number: updated.number,
      district: updated.district,
      complement: updated.complement,
    }),
  );
});

defineFlowCase('MC-ET016-CT003', async (context) => {
  await loginAndOpenAddresses(context);
  const [address] = await readAddresses(context.page, context.backendUrl);
  expect(address).toBeTruthy();
  const dialog = await openEditAddress(context.page, address);
  let calls = 0;
  await context.page.route('**/viacep.com.br/**', async (route) => {
    calls += 1;
    await route.abort();
  });
  await dialog.getByLabel('CEP').fill('1234');
  await dialog.getByRole('button', { name: 'salvar' }).click();
  await expect(dialog.getByText('Informe um CEP válido (00000-000).')).toBeVisible();
  expect(calls).toBe(0);
  expect((await readAddresses(context.page, context.backendUrl)).find((candidate) => candidate.id === address.id)).toEqual(address);
});

defineFlowCase('MC-ET016-CT004', async (context) => {
  const zipcode = '99999-999';
  await mockMissingCep(context.page, zipcode);
  await loginAndOpenAddresses(context);
  const [address] = await readAddresses(context.page, context.backendUrl);
  expect(address).toBeTruthy();
  const dialog = await openEditAddress(context.page, address);
  await dialog.getByLabel('CEP').fill(zipcode);
  await expect(dialog.getByText('Não encontramos seu CEP, tente outro.')).toBeVisible();
  expect((await readAddresses(context.page, context.backendUrl)).find((candidate) => candidate.id === address.id)).toEqual(address);
});

defineFlowCase('MC-ET016-CT005', async (context) => {
  await loginAndOpenAddresses(context);
  const [address] = await readAddresses(context.page, context.backendUrl);
  expect(address).toBeTruthy();
  const zipcode = address.zipcode.replace(/\D/g, '') === '01310100' ? '20040-020' : '01310-100';
  let lookupCalls = 0;
  await context.page.route(`**/ws/${zipcode.replace(/\D/g, '')}/json/`, async (route) => {
    lookupCalls += 1;
    await route.abort('failed');
  });
  const dialog = await openEditAddress(context.page, address);

  await dialog.getByLabel('CEP').fill(zipcode);

  await expect.poll(() => lookupCalls, 'a consulta ao ViaCEP deve ser executada').toBeGreaterThan(0);
  expect(
    (await readAddresses(context.page, context.backendUrl)).find((candidate) => candidate.id === address.id),
    'a falha da consulta não deve alterar o endereço existente',
  ).toEqual(address);
  await expect(
    dialog.getByText(/^Consulta indisponível, tente novamente mais tarde\.?$/i),
    'deve distinguir indisponibilidade da consulta de CEP não encontrado',
  ).toBeVisible();
});

defineFlowCase('MC-ET016-CT006', async (context) => {
  await loginAndOpenAddresses(context);
  const [address] = await readAddresses(context.page, context.backendUrl);
  expect(address).toBeTruthy();
  const dialog = await openEditAddress(context.page, address);
  await dialog.getByLabel('Número').fill('');
  await dialog.getByRole('button', { name: 'salvar' }).click();
  await expect(dialog.getByText('O número é obrigatório.')).toBeVisible();
  expect((await readAddresses(context.page, context.backendUrl)).find((candidate) => candidate.id === address.id)).toEqual(address);
});

defineFlowCase('MC-ET016-CT008', async (context) => {
  const updated = addressFor(context.testCase.id);
  await mockViaCep(context.page, updated);
  await loginCustomerByApi(context.page, context.request, accountForCase(context.testCase.id, context.testInfo.project.name));
  const snapshotBefore = await orderAddressSnapshot(context.page);
  await openAddresses(context.page);
  const [address] = await readAddresses(context.page, context.backendUrl);
  const dialog = await openEditAddress(context.page, address);
  await fillAddress(dialog, updated);
  expect((await submitAddress(context.page, dialog, 'PUT')).ok()).toBeTruthy();
  const snapshotAfter = await orderAddressSnapshot(context.page);
  expect(snapshotAfter).toBe(snapshotBefore);
  expect(snapshotAfter).not.toContain(updated.street);
});

defineFlowCase('MC-ET017-CT001', async (context) => {
  await loginAndOpenAddresses(context);
  const addresses = await readAddresses(context.page, context.backendUrl);
  const current = addresses.find((address) => address.is_primary);
  const secondary = addresses.find((address) => !address.is_primary);
  expect(current).toBeTruthy();
  expect(secondary).toBeTruthy();
  const menu = await openAddressMenu(context.page, addressRow(context.page, secondary!));
  const responsePromise = context.page.waitForResponse(
    (response) => response.url().includes(`/api/v1/accounts/addresses/${secondary!.id}`) && response.request().method() === 'PUT',
  );
  await menu.getByText('Tornar principal', { exact: true }).click();
  expect((await responsePromise).ok()).toBeTruthy();
  await expect(addressRow(context.page, secondary!).getByText('Endereço principal')).toBeVisible();
  const stored = await readAddresses(context.page, context.backendUrl);
  expect(stored.filter((address) => address.is_primary)).toHaveLength(1);
  expect(stored.find((address) => address.is_primary)?.id).toBe(secondary!.id);
});

defineFlowCase('MC-ET017-CT002', async (context) => {
  await loginAndOpenAddresses(context);
  const principal = (await readAddresses(context.page, context.backendUrl)).find((address) => address.is_primary);
  expect(principal).toBeTruthy();
  const row = addressRow(context.page, principal!);
  await expect(row.getByText('Endereço principal')).toBeVisible();
  const menu = await openAddressMenu(context.page, row);
  await expect(menu.getByText('Tornar principal', { exact: true })).toHaveCount(0);
  expect((await readAddresses(context.page, context.backendUrl)).filter((address) => address.is_primary)).toHaveLength(1);
});

defineFlowCase('MC-ET018-CT001', async (context) => {
  await loginAndOpenAddresses(context);
  const [address] = await readAddresses(context.page, context.backendUrl);
  expect(address).toBeTruthy();
  const menu = await openAddressMenu(context.page, addressRow(context.page, address));
  await menu.getByText('Excluir', { exact: true }).click();
  const dialog = context.page.getByRole('dialog');
  await expect(dialog.getByText('Tem certeza que deseja excluir esse endereço?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Não', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(addressRow(context.page, address)).toBeVisible();
  expect((await readAddresses(context.page, context.backendUrl)).some((candidate) => candidate.id === address.id)).toBe(true);
});

defineFlowCase('MC-ET018-CT002', async (context) => {
  await loginAndOpenAddresses(context);
  const addresses = await readAddresses(context.page, context.backendUrl);
  const principal = addresses.find((address) => address.is_primary);
  const secondary = addresses.find((address) => !address.is_primary);
  expect(principal).toBeTruthy();
  expect(secondary).toBeTruthy();
  await deleteAddress(context.page, secondary!);
  await expect(addressRow(context.page, secondary!)).toBeHidden();
  await expect(addressRow(context.page, principal!).getByText('Endereço principal')).toBeVisible();
  const stored = await readAddresses(context.page, context.backendUrl);
  expect(stored.some((address) => address.id === secondary!.id)).toBe(false);
  expect(stored.find((address) => address.id === principal!.id)?.is_primary).toBe(true);
});

defineFlowCase('MC-ET018-CT003', async (context) => {
  await loginAndOpenAddresses(context);
  const addresses = await readAddresses(context.page, context.backendUrl);
  const principal = addresses.find((address) => address.is_primary);
  const replacements = addresses.filter((address) => !address.is_primary);
  expect(principal).toBeTruthy();
  expect(replacements.length).toBeGreaterThan(0);
  await deleteAddress(context.page, principal!);
  const stored = await readAddresses(context.page, context.backendUrl);
  expect(stored.some((address) => address.id === principal!.id)).toBe(false);
  expect(stored.filter((address) => address.is_primary)).toHaveLength(1);
  expect(stored.find((address) => address.is_primary)?.id).toBe(Math.max(...replacements.map((address) => address.id)));
});

defineFlowCase('MC-ET018-CT004', async (context) => {
  await loginAndOpenAddresses(context);
  const addresses = await readAddresses(context.page, context.backendUrl);
  expect(addresses).toHaveLength(1);
  await deleteAddress(context.page, addresses[0]);
  await expect(context.page.getByText('Nenhum endereço cadastrado')).toBeVisible();
  expect(await readAddresses(context.page, context.backendUrl)).toHaveLength(0);
});

defineFlowCase('MC-ET018-CT005', async (context) => {
  await loginCustomerByApi(context.page, context.request, accountForCase(context.testCase.id, context.testInfo.project.name));
  const snapshotBefore = await orderAddressSnapshot(context.page);
  await openAddresses(context.page);
  const [address] = await readAddresses(context.page, context.backendUrl);
  expect(address).toBeTruthy();
  await deleteAddress(context.page, address);
  expect((await readAddresses(context.page, context.backendUrl)).some((candidate) => candidate.id === address.id)).toBe(false);
  const snapshotAfter = await orderAddressSnapshot(context.page);
  expect(snapshotAfter).toBe(snapshotBefore);
  expect(snapshotAfter).toContain(address.street);
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
