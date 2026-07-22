import { defineBlockedCase, defineFlowCase, expect, test } from '../../support/flow-test.js';
import { expectNoServerError } from '../../support/navigation.js';
import {
  allVehicles,
  currentUser,
  latestOrders,
  loginForCase,
  openDashboard,
  primaryVehicle,
} from './account-helpers.js';

defineFlowCase('MC-ET004-CT001', async ({ page, request, backendUrl, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  await openDashboard(page);
  const [user, vehicle] = await Promise.all([
    currentUser(page, backendUrl),
    primaryVehicle(page, backendUrl),
  ]);
  const address = user.addresses.find((item) => item.is_primary);

  await test.step('Validar veículo e endereço principais da conta autenticada', async () => {
    expect(address, 'massa deve possuir endereço principal').toBeTruthy();
    await expect(page.locator('app-account-registered-vehicles')).toContainText(vehicle.brand);
    await expect(page.locator('app-account-registered-vehicles')).toContainText(vehicle.version);
    const addressCard = page.locator('.card.default').filter({ hasText: 'MEUS ENDEREÇOS' });
    await expect(addressCard).toContainText(address?.street ?? '');
    await expect(addressCard).toContainText(address?.city_name ?? '');
    await expectNoServerError(page);
  });
});

defineFlowCase('MC-ET004-CT002', async ({ page, request, backendUrl, testInfo, testCase }) => {
  await page.route('https://storage.xbri.info/**', async (route) => {
    if (route.request().resourceType() === 'image') {
      await route.abort();
      return;
    }
    await route.continue();
  });

  const latestOrdersResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/customers/orders/latest?limit=2') &&
      response.request().method() === 'GET',
  );
  await loginForCase(page, request, testCase.id, testInfo);
  expect((await latestOrdersResponse).ok(), 'dashboard deve carregar os últimos pedidos').toBeTruthy();
  const orders = await latestOrders(page, backendUrl);

  await test.step('Validar no máximo dois cards dos pedidos mais recentes', async () => {
    expect(orders.length, 'massa deve possuir pedidos recentes').toBeGreaterThanOrEqual(1);
    expect(orders.length).toBeLessThanOrEqual(2);
    const cards = page.locator('.account-order-card__desktop .order-card');
    await expect(cards).toHaveCount(orders.length);
    for (const [index, order] of orders.entries()) {
      await expect(cards.nth(index)).toContainText('Data do pedido');
      await expect(cards.nth(index)).toContainText('Valor total');
      await expect(cards.nth(index).getByText('Ver Pedido')).toBeVisible();
    }
  });
});

defineFlowCase('MC-ET004-CT003', async ({ page, request, backendUrl, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  await openDashboard(page);
  const user = await currentUser(page, backendUrl);

  await test.step('Validar identificação e CPF mascarado no dashboard', async () => {
    expect(user.document?.replace(/\D/g, '')).toHaveLength(11);
    const card = page.locator('.card.default').filter({ hasText: 'IDENTIFICAÇÃO' });
    await expect(card).toContainText(user.name ?? '');
    await expect(card).toContainText(user.last_name ?? '');
    await expect(card.locator('.card__description--text').nth(1)).toHaveText(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
  });
});

defineFlowCase('MC-ET004-CT004', async ({ page, request, backendUrl, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  await openDashboard(page);
  const user = await currentUser(page, backendUrl);

  await test.step('Validar identificação PJ no dashboard', async () => {
    expect(user.document?.replace(/\D/g, '')).toHaveLength(14);
    const card = page.locator('.card.default').filter({ hasText: 'IDENTIFICAÇÃO' });
    await expect(card).toContainText(user.name ?? '');
    await expect(card.locator('.card__description--text').nth(1)).toHaveText(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
  });
});

defineBlockedCase(
  'MC-ET004-CT006',
  'O dashboard atual sempre renderiza Modelos em destaque; ele não consulta nem apresenta pneus compatíveis com o veículo principal.',
);

defineFlowCase('MC-ET004-CT007', async ({ page, request, backendUrl, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  await openDashboard(page);
  const [user, vehicles, orders] = await Promise.all([
    currentUser(page, backendUrl),
    allVehicles(page, backendUrl),
    latestOrders(page, backendUrl),
  ]);

  await test.step('Confirmar usuário sem endereços, veículos e pedidos', async () => {
    expect(user.addresses).toHaveLength(0);
    expect(vehicles).toHaveLength(0);
    expect(orders).toHaveLength(0);
  });

  await test.step('Validar os estados vazios e suas ações primárias', async () => {
    const vehiclesCard = page.locator('app-account-registered-vehicles');
    await expect(vehiclesCard.getByText('Nenhum veículo cadastrado', { exact: true })).toBeVisible();
    await expect(vehiclesCard.getByRole('button', { name: 'Adicionar veículo' })).toBeVisible();
    await expect(vehiclesCard.locator('.account-registered-vehicles')).toHaveCount(0);

    const addressCard = page.locator('.card.default').filter({ hasText: 'MEUS ENDEREÇOS' });
    await expect(addressCard).toContainText('Adicione um endereço para usar nas suas próximas compras.');

    const ordersCard = page.locator('app-account-order-card');
    await expect(ordersCard.getByText('Você ainda não fez nenhum pedido', { exact: true })).toBeVisible();
    await expect(ordersCard.getByRole('button', { name: 'Encontre o seu pneu' })).toBeVisible();
    await expect(ordersCard.locator('.order-card')).toHaveCount(0);
    await expectNoServerError(page);
  });
});

defineFlowCase('MC-ET004-CT008', async ({ page, request, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  await openDashboard(page);

  await test.step('Validar modelos mais vendidos/destaques do marketplace', async () => {
    const featured = page.locator('app-featured-models');
    await expect(featured.getByText('Modelos em destaque')).toBeVisible();
    await expect(featured.getByText('Top modelos', { exact: false })).toBeVisible();
    await expect(featured.locator('.featured-models__content--box')).not.toHaveCount(0);
    await expect(featured.getByRole('button', { name: 'Ver todos os modelos' })).toBeVisible();
  });
});

defineFlowCase('MC-ET004-CT009', async ({ page, request, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  await openDashboard(page);

  await test.step('Validar anúncio configurado e visível', async () => {
    const banner = page.locator('.my-account .banner');
    await expect(banner).toBeVisible();
    const background = await banner.evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(background).toContain('banner-offer');
    await expectNoServerError(page);
  });
});
