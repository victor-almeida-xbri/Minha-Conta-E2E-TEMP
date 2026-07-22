import { defineBlockedCase, defineFlowCase, expect, test } from '../../support/flow-test.js';
import { allOrders, loginForCase, openDashboard } from './account-helpers.js';

defineBlockedCase(
  'MC-ET005-CT002',
  'O dashboard atual não renderiza a ação do estado vazio de pedidos quando não há pedidos; por isso o conjunto de três redirecionamentos exigido não pode ser acionado.',
);

defineBlockedCase(
  'MC-ET005-CT004',
  'A ação "Ver pneus compatíveis" redireciona apenas para /produtos, sem transportar qualquer contexto do veículo principal.',
);

defineBlockedCase(
  'MC-ET005-CT006',
  'Os cards de Modelos em destaque não possuem link ou ação; somente o botão genérico "Ver todos os modelos" navega para /produtos.',
);

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
      const tab = page.locator('.tabs__item').filter({ hasText: new RegExp(`^${destination.label}$`, 'i') }).first();
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
