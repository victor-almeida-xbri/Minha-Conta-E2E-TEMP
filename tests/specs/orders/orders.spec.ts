import { type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { accountForCase, bearerHeaders, loginCustomerByApi } from '../../support/auth.js';
import { defineBlockedCase, defineFlowCase, expect, test, type FlowContext } from '../../support/flow-test.js';

type OrderSummary = {
  id: string;
  code: number;
  serial: number;
  created_at: string;
  total_value: number;
  status: { status: string };
  items: Array<{ product_name: string; quantity: number; total_value: number }>;
};

type OrderDetails = OrderSummary & {
  total_items: number;
  total_freight: number;
  shipping: {
    street: string;
    number: string;
    district: string;
    zipcode: string;
    city?: { name: string; state?: { name: string } };
  };
};

async function loginForCase(
  page: Page,
  request: APIRequestContext,
  caseId: string,
  testInfo: TestInfo,
): Promise<void> {
  await loginCustomerByApi(page, request, accountForCase(caseId, testInfo.project.name));
}

async function openOrders(context: FlowContext): Promise<void> {
  await loginForCase(context.page, context.request, context.testCase.id, context.testInfo);
  await context.page.goto('/minha-conta/meus-pedidos', { waitUntil: 'domcontentloaded' });
  await expect(context.page.getByText('Pedidos realizados', { exact: true })).toBeVisible();
}

async function readOrders(page: Page, backendUrl: string): Promise<OrderSummary[]> {
  const response = await page.request.get(`${backendUrl}/api/v1/customers/orders?page=1`, {
    headers: await bearerHeaders(page),
  });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { data: OrderSummary[] }).data;
}

async function readOrder(page: Page, backendUrl: string, id: string): Promise<OrderDetails> {
  const response = await page.request.get(`${backendUrl}/api/v1/orders/${id}`, { headers: await bearerHeaders(page) });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { data: OrderDetails }).data;
}

async function openOnlyOrder(context: FlowContext): Promise<OrderDetails> {
  await openOrders(context);
  const orders = await readOrders(context.page, context.backendUrl);
  expect(orders.length, `${context.testCase.id} requer ao menos um pedido preparado`).toBeGreaterThan(0);
  const selected = orders[0];
  const detailResponse = context.page.waitForResponse(
    (response) => response.url().includes(`/api/v1/orders/${selected.id}`) && response.request().method() === 'GET',
  );
  await context.page.locator('.box-orders-info').first().click();
  expect((await detailResponse).ok()).toBeTruthy();
  await expect(context.page).toHaveURL(new RegExp(`/minha-conta/meus-pedidos/${selected.id}/?$`));
  await expect(context.page.getByText('Detalhes do pedido', { exact: true })).toBeVisible();
  return readOrder(context.page, context.backendUrl, selected.id);
}

async function openPendingPayment(context: FlowContext): Promise<OrderDetails> {
  const order = await openOnlyOrder(context);
  expect(order.status.status).toBe('ORDER_PLACED');
  await expect(context.page.getByText('Pagamento pendente', { exact: true })).toBeVisible();
  return order;
}

async function openPaymentDialog(context: FlowContext): Promise<OrderDetails> {
  const order = await openPendingPayment(context);
  await context.page.getByRole('button', { name: 'Escolher forma de pagamento', exact: true }).click();
  await expect(context.page.getByText('Escolha a Forma de pagamento', { exact: true })).toBeVisible();
  return order;
}

defineBlockedCase(
  'MC-ET019-CT001',
  'OrdersComponent inicializa orders como [] e testa !orders para exibir o estado vazio; como [] e truthy, a mensagem e a ação de catálogo nunca são renderizadas.',
);

defineFlowCase('MC-ET019-CT002', async (context) => {
  let orders: OrderSummary[] = [];
  await test.step('Acessar Meus Pedidos com múltiplos pedidos preparados', async () => {
    await openOrders(context);
    orders = await readOrders(context.page, context.backendUrl);
    expect(orders.length).toBeGreaterThanOrEqual(2);
  });
  await test.step('Visualizar a listagem e validar os resumos canônicos', async () => {
    await expect(context.page.locator('.box-orders-info')).toHaveCount(orders.length);
    for (const [index, order] of orders.entries()) {
      const card = context.page.locator('.box-orders-info').nth(index);
      await expect(card.getByText(`#${order.code}`, { exact: true })).toBeVisible();
      await expect(card.getByAltText(order.items[0].product_name, { exact: true })).toBeVisible();
    }
  });
  await test.step('Validar a ordenação decrescente aplicada pelo backend', async () => {
    expect(orders.map((order) => Date.parse(order.created_at))).toEqual(
      [...orders].map((order) => Date.parse(order.created_at)).sort((left, right) => right - left),
    );
  });
});

defineFlowCase('MC-ET020-CT001', async (context) => {
  let order: OrderDetails;
  await test.step('Acessar Meus Pedidos e selecionar o primeiro pedido', async () => {
    order = await openOnlyOrder(context);
  });
  await test.step('Validar número e produtos do pedido selecionado', async () => {
    await expect(context.page.getByText(`#${order.serial}`, { exact: true })).toBeVisible();
    for (const item of order.items) {
      const product = context.page.locator('app-product-summary-card').filter({ hasText: item.product_name }).first();
      await expect(product).toBeVisible();
      await expect(product.getByText(String(item.quantity), { exact: true })).toBeVisible();
    }
  });
  await test.step('Validar endereço de entrega e resumo financeiro', async () => {
    await expect(context.page.getByText(`${order.shipping.street}, ${order.shipping.number}`, { exact: false })).toBeVisible();
    await expect(context.page.getByText(order.shipping.zipcode, { exact: true })).toBeVisible();
    await expect(context.page.locator('.order-details__summary')).toContainText('Total');
  });
});

defineBlockedCase(
  'MC-ET020-CT003',
  'O bloco de pedido entregue que contém o botão Comprar novamente está comentado no template de detalhes e não existe handler de recompra no componente.',
);

defineFlowCase('MC-ET021-CT001', async (context) => {
  let order: OrderDetails;
  await test.step('Acessar pedido com pagamento pendente', async () => {
    order = await openPendingPayment(context);
  });
  await test.step('Validar valor da cobrança pendente', async () => {
    await expect(context.page.locator('.pending-order__description')).toContainText(
      (order.total_value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    );
  });
  await test.step('Validar formas de pagamento anunciadas pelo detalhe', async () => {
    await expect(context.page.locator('.pending-order__text')).toContainText('PIX');
    await expect(context.page.locator('.pending-order__text')).toContainText('cartão');
    await expect(context.page.getByRole('button', { name: 'Escolher forma de pagamento', exact: true })).toBeVisible();
  });
});

defineFlowCase('MC-ET021-CT003', async (context) => {
  const modal = context.page.locator('mat-dialog-container');
  await test.step('Acessar o pedido e acionar a escolha de pagamento', async () => {
    await openPaymentDialog(context);
  });
  await test.step('Validar somente as formas elegíveis apresentadas', async () => {
    await expect(modal.getByText('Cartão de Crédito', { exact: true })).toBeVisible();
    await expect(modal.getByText('Pix', { exact: true })).toBeVisible();
  });
  await test.step('Selecionar PIX e validar o encaminhamento para sua tela', async () => {
    await modal.getByText('Pix', { exact: true }).click();
    await expect(modal.getByAltText('QR code pix')).toBeVisible();
    await expect(modal.getByPlaceholder('Código PIX')).toBeVisible();
  });
});

defineBlockedCase(
  'MC-ET022-CT001',
  'A seleção de PIX no modal não chama POST /api/v1/orders/{id}/pay; QR Code, chave e prazo são valores estáticos do frontend, portanto nenhuma cobrança é gerada.',
);

defineBlockedCase(
  'MC-ET022-CT002',
  'O botão Copiar código não possui binding de clique no template; o método onCopyPixCode existe, mas nunca é acionado pela interface.',
);

defineBlockedCase(
  'MC-ET022-CT003',
  'A tela não consulta nem renderiza a situação de uma cobrança PIX real; exibe sempre QR Code, chave fixa e contador local de oito minutos.',
);

defineBlockedCase(
  'MC-ET022-CT004',
  'Não há emulador ou rota local de webhook Pagar.me declarada no Checkout e o frontend não consulta atualização de cobrança PIX no detalhe do pedido.',
);

defineBlockedCase(
  'MC-ET022-CT005',
  'O contador PIX apenas chega a 00:00; não há estado expirado, invalidação do QR Code nem ação para gerar um novo código.',
);

defineFlowCase('MC-ET023-CT001', async (context) => {
  const modal = context.page.locator('mat-dialog-container');
  await test.step('Selecionar cartão de crédito no pagamento pendente', async () => {
    await openPaymentDialog(context);
  });
  await test.step('Validar os campos obrigatórios do cartão', async () => {
    await expect(modal.getByLabel('Número do cartão', { exact: true })).toBeVisible();
    await expect(modal.getByLabel('Nome impresso no cartão', { exact: true })).toBeVisible();
    await expect(modal.getByLabel('Validade', { exact: true })).toBeVisible();
    await expect(modal.getByLabel('Código de segurança', { exact: true })).toBeVisible();
  });
  await test.step('Carregar opções de parcelamento retornadas pelo backend', async () => {
    await expect(modal.getByPlaceholder('Parcelas')).toBeVisible();
    await modal.getByPlaceholder('Parcelas').click();
    await expect(modal.locator('.wrapper-selector__dropdown-body-item').first()).toBeVisible();
  });
});

defineBlockedCase(
  'MC-ET023-CT002',
  'O ambiente local não declara emulador Pagar.me; o pagamento real depende de tokenização e da API externa configurada por PAGARME_BASE_URI, sem cenário determinístico de aprovação.',
);

defineBlockedCase(
  'MC-ET023-CT003',
  'O ambiente local não declara emulador Pagar.me nem cartão de teste recusado determinístico; não é possível validar recusa e manutenção do pedido sem acessar o gateway externo.',
);

defineBlockedCase(
  'MC-ET023-CT004',
  'Não existe resposta pendente configurável no ambiente local nem atualização posterior via emulador; o Checkout aponta diretamente para a API Pagar.me configurada.',
);

defineBlockedCase(
  'MC-ET023-CT005',
  'A validação ponta a ponta do parcelamento exige uma transação Pagar.me observável; não há emulador local declarado para conferir parcelas e total processados.',
);

defineBlockedCase(
  'MC-ET024-CT001',
  'O botão Baixar nota Fiscal é renderizado sem binding de clique e o detalhe do pedido não apresenta número ou vínculo da NF-e.',
);

defineBlockedCase(
  'MC-ET024-CT002',
  'Não existe ação de download no botão de NF-e nem endpoint público de documento fiscal usado pelo frontend; headers, conteúdo e integridade não são observáveis.',
);

defineBlockedCase(
  'MC-ET024-CT004',
  'Como o botão de NF-e não dispara requisição, a interface não possui tratamento de indisponibilidade nem mensagem de falha para o documento fiscal.',
);

defineBlockedCase(
  'MC-ET025-CT001',
  'O detalhe mostra apenas um botão Rastrear pedido sem binding de clique; tracking_code e eventos logísticos não são renderizados pelo componente.',
);

defineBlockedCase(
  'MC-ET025-CT002',
  'A timeline é fixa em quatro marcos derivados somente do status do pedido; não há consulta ou apresentação de eventos logísticos anteriores e novos.',
);

defineBlockedCase(
  'MC-ET025-CT003',
  'Para ORDER_SHIPPED o frontend apresenta Rastrear pedido incondicionalmente, sem verificar tracking_code; não existe estado específico de envio sem rastreamento.',
);

defineBlockedCase(
  'MC-ET026-CT001',
  'A ação Cancelar pedido chama a criação de uma solicitação em /orders/cancellation/create; ela não cancela imediatamente o pedido nem apresenta mensagem de sucesso conforme o contrato.',
);

defineFlowCase('MC-ET026-CT002', async (context) => {
  let order: OrderDetails;
  let statusBefore: string;
  let cancellationRequests = 0;
  await test.step('Acessar pedido elegível e registrar seu estado inicial', async () => {
    order = await openOnlyOrder(context);
    statusBefore = order.status.status;
    context.page.on('request', (request) => {
      if (request.url().includes('/api/v1/orders/cancellation/create') && request.method() === 'POST') {
        cancellationRequests += 1;
      }
    });
  });
  await test.step('Acionar cancelamento e escolher Manter o pedido', async () => {
    await context.page.getByRole('button', { name: 'Cancelar pedido', exact: true }).click();
    await expect(context.page.getByText('Tem certeza que deseja cancelar o pedido?', { exact: true })).toBeVisible();
    await context.page.getByRole('button', { name: 'Manter o pedido', exact: true }).click();
    await expect(context.page.getByText('Tem certeza que deseja cancelar o pedido?', { exact: true })).toBeHidden();
  });
  await test.step('Validar ausência de comando e preservação do estado', async () => {
    expect(cancellationRequests).toBe(0);
    expect((await readOrder(context.page, context.backendUrl, order.id)).status.status).toBe(statusBefore);
  });
});

defineBlockedCase(
  'MC-ET026-CT003',
  'O frontend não revalida elegibilidade antes da confirmação e o formulário enviado não contém versão/estado; a perda concorrente de elegibilidade não possui fluxo observável já existente.',
);

defineBlockedCase(
  'MC-ET027-CT001',
  'Em pedido entregue, o frontend habilita devolução para todos os itens recebidos e não consome quantidades já devolvidas ou justificativas de inelegibilidade.',
);

defineBlockedCase(
  'MC-ET027-CT002',
  'O formulário de devolução não envia o request_type obrigatório pela API e a opção reason_id=2 exige descrição e evidência, contrariando o fluxo sem upload de arrependimento.',
);

defineBlockedCase(
  'MC-ET027-CT003',
  'O formulário não envia o request_type obrigatório por CreateCancellationRequest; a submissão é rejeitada antes de criar solicitação, anexos e protocolo.',
);

defineBlockedCase(
  'MC-ET027-CT004',
  'O seletor limita visualmente ao quantity original, mas não considera quantidades já devolvidas/em processo e não apresenta a validação histórica exigida.',
);

defineBlockedCase(
  'MC-ET027-CT005',
  'O upload aceita .pdf e image/*, porém não valida tipo/tamanho no frontend; além disso, a API aceita qualquer tipo de arquivo até 10 MB e não exige evidência por motivo.',
);

defineFlowCase('MC-ET027-CT006', async (context) => {
  let cancellationRequests = 0;
  await test.step('Acessar pedido entregue e abrir a solicitação de devolução', async () => {
    const order = await openOnlyOrder(context);
    expect(order.status.status).toBe('ORDER_DELIVERED');
    const reasonsResponse = context.page.waitForResponse(
      (response) => response.url().includes('/api/v1/orders/reasons/list') && response.request().method() === 'GET',
    );
    await context.page.getByRole('button', { name: 'Devolver pedido completo', exact: true }).click();
    expect((await reasonsResponse).ok()).toBeTruthy();
    await expect(context.page.getByText('Solicitação de devolução', { exact: true })).toBeVisible();
  });
  await test.step('Preencher o fluxo e manter o aceite obrigatório desmarcado', async () => {
    const modal = context.page.locator('mat-dialog-container');
    await modal.getByLabel('Motivo da devolução', { exact: true }).click();
    await context.page.getByRole('option').first().click();
    context.page.on('request', (request) => {
      if (request.url().includes('/api/v1/orders/cancellation/create') && request.method() === 'POST') {
        cancellationRequests += 1;
      }
    });
    await modal.getByRole('button', { name: 'Solicitar devolução', exact: true }).click();
  });
  await test.step('Validar aceite obrigatório e ausência de processo criado', async () => {
    await expect(context.page.getByText('Você deve concordar com os Termos e Condições.', { exact: true })).toBeVisible();
    expect(cancellationRequests).toBe(0);
  });
});
