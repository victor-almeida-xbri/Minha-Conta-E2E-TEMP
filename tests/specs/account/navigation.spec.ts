import { defineBlockedCase, defineFlowCase, expect, test } from '../../support/flow-test.js';
import {
  allOrders,
  allVehicles,
  currentUser,
  latestOrders,
  loginForCase,
  openDashboard,
} from './account-helpers.js';

defineFlowCase('MC-ET005-CT002', async ({ page, request, backendUrl, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  const [user, vehicles, orders] = await Promise.all([
    currentUser(page, backendUrl),
    allVehicles(page, backendUrl),
    latestOrders(page, backendUrl),
  ]);
  expect(user.addresses, 'massa deve estar sem endereços').toHaveLength(0);
  expect(vehicles, 'massa deve estar sem veículos').toHaveLength(0);
  expect(orders, 'massa deve estar sem pedidos').toHaveLength(0);

  const mutations: string[] = [];
  page.on('request', (candidate) => {
    if (candidate.url().includes('/api/v1/') && !['GET', 'OPTIONS'].includes(candidate.method())) {
      mutations.push(`${candidate.method()} ${candidate.url()}`);
    }
  });

  await test.step('Estado vazio de veículos redireciona para Meus Veículos', async () => {
    const vehiclesCard = page.locator('app-account-registered-vehicles');
    await expect(vehiclesCard.getByText('Nenhum veículo cadastrado', { exact: true })).toBeVisible();
    await vehiclesCard.getByRole('button', { name: 'Adicionar veículo', exact: true }).click();
    await expect(page).toHaveURL(/\/minha-conta\/meus-veiculos\/?$/);
    await expect(page.getByText('Nenhum veículo cadastrado', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adicionar novo veículo', exact: true })).toBeVisible();
  });

  await test.step('Estado vazio de endereços redireciona para Meus Endereços', async () => {
    await openDashboard(page);
    const addressCard = page.locator('.card.default').filter({ hasText: 'MEUS ENDEREÇOS' });
    await expect(addressCard).toContainText('Adicione um endereço para usar nas suas próximas compras.');
    await addressCard.click();
    await expect(page).toHaveURL(/\/minha-conta\/meus-enderecos\/?$/);
    await expect(page.getByText('Nenhum endereço cadastrado', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adicionar endereço', exact: true })).toBeVisible();
  });

  await test.step('Estado vazio de pedidos redireciona para o catálogo', async () => {
    await openDashboard(page);
    const ordersAction = page
      .locator('app-account-order-card')
      .getByRole('button', { name: 'Encontre o seu pneu', exact: true });

    if (!(await ordersAction.isVisible())) {
      const reason =
        'O dashboard força o card de pedidos com emptyState=false e não renderiza a ação do estado vazio quando não há pedidos.';
      test.info().annotations.push({ type: 'blocked-contract', description: reason });
      expect(mutations, 'os redirecionamentos disponíveis não devem criar entidades').toEqual([]);
      test.fixme(true, `${testCase.id}: ${reason}`);
    }

    await ordersAction.click();
    await expect(page).toHaveURL(/\/produtos\/?$/);
  });

  expect(mutations, 'os redirecionamentos não devem criar entidades').toEqual([]);
});

defineBlockedCase(
  'MC-ET005-CT004',
  'A ação "Ver pneus compatíveis" redireciona apenas para /produtos, sem transportar qualquer contexto do veículo principal.',
);

defineFlowCase('MC-ET005-CT006', async ({ page, request, backendUrl, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  const vehicles = await allVehicles(page, backendUrl);
  expect(vehicles, 'massa deve possuir um veículo cadastrado').toHaveLength(1);
  expect(vehicles[0].is_primary, 'o veículo cadastrado deve ser o principal').toBeTruthy();

  await test.step('Abrir o catálogo e selecionar um pneu', async () => {
    await page.goto('/produtos', { waitUntil: 'domcontentloaded' });
    const productCards = page.locator('.list-products__content--item').filter({
      has: page.getByRole('button', { name: 'Mais detalhes', exact: true }),
    });
    await expect(productCards).not.toHaveCount(0);

    const selectedCard = productCards.first();
    const selectedModel = (await selectedCard.locator('.info__description').innerText()).trim();
    const selectedMeasure = (await selectedCard.locator('.info__title').innerText()).trim();
    expect(selectedModel, 'card deve apresentar o modelo do pneu').not.toBe('');
    expect(selectedMeasure, 'card deve apresentar a medida do pneu').not.toBe('');

    await selectedCard.getByRole('button', { name: 'Mais detalhes', exact: true }).click();
    await expect(page).toHaveURL(/\/produtos\/[^/?]+__[^/?]+\/?$/);
    await expect(page.locator('app-product-summary .product-model')).toContainText(selectedModel);
    await expect(page.locator('app-product-summary .product-name')).toContainText(selectedMeasure);
  });
});

defineFlowCase('MC-ET005-CT001', async ({ page, request, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  const mutations: string[] = [];
  page.on('request', (candidate) => {
    if (candidate.url().includes('/api/v1/') && !['GET', 'OPTIONS'].includes(candidate.method())) {
      mutations.push(`${candidate.method()} ${candidate.url()}`);
    }
  });
  const destinations = [
    { label: 'Início', path: '/minha-conta' },
    { label: 'Identificação', path: '/minha-conta/identificacao' },
    { label: 'Meus veículos', path: '/minha-conta/meus-veiculos' },
    { label: 'Meus endereços', path: '/minha-conta/meus-enderecos' },
    { label: 'MEUS Pedidos', path: '/minha-conta/meus-pedidos' },
    { label: 'Devoluções', path: '/minha-conta/devolucoes' },
    { label: 'Autenticação', path: '/minha-conta/autenticacao' },
  ];

  for (const destination of destinations) {
    await test.step(`Navegar para ${destination.label}`, async () => {
      const escapedLabel = destination.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const tab = page
        .locator(
          ':is(.my-account > .managers, .manager-account > .manager-account__header) > .swiper > .tabs > .tabs__item',
        )
        .filter({ hasText: new RegExp(`^\\s*${escapedLabel}\\s*$`, 'i') });
      await expect(tab).toHaveCount(1);
      await tab.click();
      await expect(page).toHaveURL(new RegExp(`${destination.path}/?$`));
      await expect(tab).toHaveClass(/active/);
    });
  }
  expect(mutations).toEqual([]);
});

defineFlowCase('MC-ET005-CT003', async ({ page, request, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  await openDashboard(page);

  await test.step('Card cadastral abre Identificação', async () => {
    await page.locator('.card.default').filter({ hasText: 'IDENTIFICAÇÃO' }).click();
    await expect(page).toHaveURL(/\/minha-conta\/identificacao\/?$/);
    await expect(page.getByRole('heading', { name: 'Dados de identificação' })).toBeVisible();
  });

  await test.step('Card de endereço abre Meus endereços', async () => {
    await openDashboard(page);
    await page.locator('.card.default').filter({ hasText: 'MEUS ENDEREÇOS' }).click();
    await expect(page).toHaveURL(/\/minha-conta\/meus-enderecos\/?$/);
  });
});

defineFlowCase('MC-ET005-CT005', async ({ page, request, backendUrl, testInfo, testCase }) => {
  await loginForCase(page, request, testCase.id, testInfo);
  await openDashboard(page);
  const orders = await allOrders(page, backendUrl);
  expect(orders.length, 'massa deve possuir pelo menos dois pedidos').toBeGreaterThanOrEqual(2);
  const cards = page.locator('.account-order-card__desktop .order-card');
  await expect(cards).toHaveCount(2);

  await test.step('Ver todos os pedidos abre a listagem', async () => {
    await page.locator('.account-order-card__header--action').getByText('Ver todos os pedidos').click();
    await expect(page).toHaveURL(/\/minha-conta\/meus-pedidos\/?$/);
    await expect(page.getByRole('heading', { name: 'Pedidos realizados' })).toBeVisible();
  });

  for (const [index, order] of orders.slice(0, 2).entries()) {
    await test.step(`Abrir o pedido correspondente ao card ${index + 1}`, async () => {
      await openDashboard(page);
      await page.locator('.account-order-card__desktop .order-card').nth(index).getByText('Ver Pedido').click();
      await expect(page).toHaveURL(new RegExp(`/minha-conta/meus-pedidos/${order.id}/?$`));
      await expect(page.getByText('Detalhes do pedido')).toBeVisible();
    });
  }
});
