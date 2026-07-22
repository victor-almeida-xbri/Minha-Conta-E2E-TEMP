import { type Page } from '@playwright/test';
import { accountForCase, bearerHeaders, loginCustomerByApi } from '../../support/auth.js';
import {
  defineBlockedCase,
  defineFlowCase,
  expect,
  test,
  type FlowContext,
} from '../../support/flow-test.js';

type ReturnStatus =
  | 'RETURN_CREATED'
  | 'UNDER_REVIEW'
  | 'DENIED'
  | 'REQUEST_CANCELLED'
  | 'CANCELLATION_APPROVED'
  | 'AWAITING_RETURN_INVOICE'
  | 'SCHEDULED_COLLECTION'
  | 'PRODUCT_COLLECTED'
  | 'PRODUCT_RECEIVED'
  | 'AWAITING_ITEM_VERIFICATION'
  | 'INCONSISTENT'
  | 'AWAITING_SHIPPING_PAYMENT'
  | 'AWAITING_RETURN_AND_RESHIPMENT_PAYMENT'
  | 'AWAITING_RESHIPMENT_PAYMENT'
  | 'AWAITING_RESHIPMENT_INVOICE'
  | 'RESHIPMENT_SCHEDULED'
  | 'REFUND_APPROVED'
  | 'REFUND_COMPLETED'
  | 'RESHIPMENT_COMPLETED';

type ReturnItem = {
  id: number;
  protocol: number | string;
  order_id: string;
  description: string | null;
  status: ReturnStatus;
  attachments: Array<{ path: string }>;
  items: Array<{ product_name: string; product_image_path: string }>;
};

type ReturnsPayload = { data: ReturnItem[] };

async function returnsFor(page: Page, backendUrl: string): Promise<ReturnItem[]> {
  const response = await page.request.get(`${backendUrl}/api/v1/orders/cancellation/list`, {
    headers: await bearerHeaders(page),
  });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as ReturnsPayload).data;
}

async function returnDetail(page: Page, backendUrl: string, protocol: string): Promise<ReturnItem> {
  const response = await page.request.get(`${backendUrl}/api/v1/orders/cancellation/${protocol}/detail`, {
    headers: await bearerHeaders(page),
  });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { data: ReturnItem }).data;
}

async function loginForReturn(context: FlowContext): Promise<void> {
  await loginCustomerByApi(
    context.page,
    context.request,
    accountForCase(context.testCase.id, context.testInfo.project.name),
  );
}

async function prepareSeededReturn(context: FlowContext, expectedStatus: ReturnStatus): Promise<ReturnItem> {
  await loginForReturn(context);

  await context.page.goto('/minha-conta/devolucoes');

  const returns = await returnsFor(context.page, context.backendUrl);
  expect(returns, `massa ${context.testCase.id} deve possuir uma devolução`).toHaveLength(1);
  const seededReturn = returns[0]!;
  expect(seededReturn.status).toBe(expectedStatus);

  return seededReturn;
}

async function openReturnDetails(context: FlowContext, seededReturn: ReturnItem): Promise<void> {
  const protocol = String(seededReturn.protocol);
  const card = context.page.locator('.order-card').filter({ hasText: `#${protocol}` });
  await expect(card).toBeVisible();

  await context.page.goto(`/minha-conta/devolucoes/${protocol}`);

  await expect(context.page).toHaveURL(new RegExp(`/minha-conta/devolucoes/${protocol}/?$`));
  await expect(context.page.getByText('Detalhes da devolução', { exact: true })).toBeVisible();
  await expect(context.page.getByText(`#${protocol}`, { exact: true })).toBeVisible();
}

defineBlockedCase(
  'MC-ET028-CT001',
  'O estado vazio atual exibe o CTA "Encontre seu pneu"; o contrato exige que nenhuma ação seja sugerida.',
);

defineBlockedCase(
  'MC-ET028-CT002',
  'A listagem atual mostra protocolo, imagens e status, mas substitui o pedido pelo protocolo e não apresenta o pedido relacionado exigido.',
);

defineBlockedCase(
  'MC-ET028-CT003',
  'A listagem atual não recebe nem renderiza ações autorizadas por estado; todos os cards oferecem apenas a navegação para detalhes.',
);

defineBlockedCase(
  'MC-ET029-CT001',
  'O detalhe atual apresenta o protocolo, mas não renderiza o pedido relacionado exigido para confirmar a seleção.',
);

defineBlockedCase(
  'MC-ET029-CT002',
  'O detalhe de pedido atual não apresenta link ou ação para acessar a devolução vinculada.',
);

defineBlockedCase(
  'MC-ET029-CT003',
  'O detalhe atual só monta quatro fases genéricas; a API/UI não projetam histórico de eventos, mensagens, documentos, coleta ou pendências.',
);

defineBlockedCase(
  'MC-ET029-CT004',
  'Embora a API retorne attachments, o detalhe atual não renderiza anexos nem distingue anexos autorizados de internos.',
);

defineBlockedCase(
  'MC-ET030-CT001',
  'O cancelamento atual atualiza o status e recarrega o detalhe, mas não apresenta a mensagem de sucesso exigida pelo contrato.',
);

defineFlowCase('MC-ET030-CT002', async (context) => {
  let seededReturn!: ReturnItem;
  await test.step('Preparar devolução elegível no estado inicial', async () => {
    seededReturn = await prepareSeededReturn(context, 'RETURN_CREATED');
    await openReturnDetails(context, seededReturn);
  });

  const statusCommands: string[] = [];
  context.page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().includes(`/cancellation/${seededReturn.protocol}/status`)) {
      statusCommands.push(request.url());
    }
  });

  await test.step('Abrir a confirmação e manter a devolução', async () => {
    await context.page.getByRole('button', { name: 'cancelar devolução', exact: true }).click();
    const dialog = context.page.getByRole('dialog');
    await expect(dialog.getByText('Tem certeza que deseja cancelar a devolução?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Manter a devolução', exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  await test.step('Confirmar ausência de comando e preservação do estado', async () => {
    expect(statusCommands).toHaveLength(0);
    const current = await returnDetail(context.page, context.backendUrl, String(seededReturn.protocol));
    expect(current.status).toBe('RETURN_CREATED');
    await expect(context.page.getByRole('button', { name: 'cancelar devolução', exact: true })).toBeVisible();
  });
});

defineBlockedCase(
  'MC-ET030-CT003',
  'A UI não possui mecanismo existente para alterar o estado entre a abertura e a confirmação; além disso, o endpoint aceita REQUEST_CANCELLED sem revalidar elegibilidade.',
);

defineBlockedCase(
  'MC-ET031-CT001',
  'O detalhe atual não renderiza responsabilidade, valor ou ação de pagamento do frete de devolução.',
);

defineBlockedCase(
  'MC-ET031-CT002',
  'Não existe fluxo de cobrança PIX de frete de devolução na tela atual, nem QR Code, chave ou expiração.',
);

defineBlockedCase(
  'MC-ET031-CT003',
  'A tela atual não consulta, exibe ou reemite cobrança PIX expirada de frete de devolução.',
);

defineBlockedCase(
  'MC-ET032-CT001',
  'O detalhe atual não possui área de reenvio nem apresenta cobrança de frete de reenvio, justificativa ou ação de pagamento.',
);

defineBlockedCase(
  'MC-ET032-CT002',
  'Não existe fluxo de geração e confirmação de PIX para frete de reenvio na interface atual.',
);

defineBlockedCase(
  'MC-ET032-CT003',
  'A interface atual não representa cobrança PIX expirada nem oferece reemissão para frete de reenvio.',
);

defineBlockedCase(
  'MC-ET033-CT001',
  'O recurso de detalhe e a interface atuais não expõem modalidade, instruções, código, link ou eventos de rastreamento da devolução.',
);

defineBlockedCase(
  'MC-ET033-CT002',
  'A interface atual não consome histórico logístico; novos eventos não podem ser comparados nem ter o histórico anterior validado.',
);

defineBlockedCase(
  'MC-ET033-CT003',
  'Status logísticos canônicos como PRODUCT_RECEIVED não são mapeados pela timeline atual e caem no estado visual inicial de devolução.',
);

defineFlowCase('MC-ET034-CT001', async (context) => {
  let seededReturn!: ReturnItem;
  await test.step('Preparar devolução aguardando análise dos itens', async () => {
    seededReturn = await prepareSeededReturn(context, 'AWAITING_ITEM_VERIFICATION');
  });

  await test.step('Acessar os detalhes da devolução', async () => {
    await openReturnDetails(context, seededReturn);
  });

  await test.step('Apresentar a fase recebida sem antecipar a decisão', async () => {
    await expect(context.page.locator('.body__default--success')).toHaveText('Produto recebido');
    await expect(context.page.getByText('Iniciamos a análise para prosseguir com o reembolso.')).toBeVisible();
    await expect(context.page.getByText(/Reembolso solicitado|Solicitação de devolução reprovada|Devolução cancelada/)).toHaveCount(0);
  });
});

defineBlockedCase(
  'MC-ET034-CT002',
  'O status canônico REFUND_APPROVED não é mapeado no detalhe atual e cai na apresentação inicial "Solicitação de devolução em análise".',
);

defineBlockedCase(
  'MC-ET034-CT003',
  'Na reprovação INCONSISTENT a interface ignora a justificativa liberada pelo backend e mostra apenas uma frase genérica; informações autorizadas não podem ser validadas.',
);

defineFlowCase('MC-ET035-CT001', async (context) => {
  let seededReturn!: ReturnItem;
  await test.step('Preparar devolução aprovada para reembolso', async () => {
    seededReturn = await prepareSeededReturn(context, 'REFUND_COMPLETED');
  });

  await test.step('Acessar os detalhes da devolução', async () => {
    await openReturnDetails(context, seededReturn);
  });

  await test.step('Apresentar as informações de restituição', async () => {
    await expect(context.page.getByText('Reembolso solicitado', { exact: true })).toBeVisible();
    await expect(
      context.page.getByText(/Será restituído o valor pelo mesmo método de pagamento utilizado na compra/),
    ).toBeVisible();
    await expect(context.page.getByText(/PIX.*banco.*cartão.*operadora/)).toBeVisible();
  });
});

defineBlockedCase(
  'MC-ET036-CT001',
  'O detalhe atual não possui área de reenvio nem renderiza situação de despacho, entrega ou informações logísticas.',
);

defineBlockedCase(
  'MC-ET036-CT002',
  'O frontend atual não consome situação, código, link ou eventos de rastreamento do reenvio.',
);

defineBlockedCase(
  'MC-ET036-CT003',
  'O detalhe atual não apresenta pendência financeira de reenvio nem bloqueia/libera despacho conforme confirmação do frete.',
);

defineBlockedCase(
  'MC-ET037-CT001',
  'Não existe ação nem endpoint consumido pelo detalhe atual para download da NF-e de devolução.',
);

defineBlockedCase(
  'MC-ET037-CT002',
  'Não existe ação nem endpoint consumido pelo detalhe atual para download da NF-e de reenvio.',
);

defineBlockedCase(
  'MC-ET037-CT003',
  'A área de documentos fiscais não existe no detalhe atual, portanto ausência e falha temporária não possuem estados observáveis distintos.',
);

defineBlockedCase(
  'MC-ET038-CT001',
  'No estado REFUND_COMPLETED a interface oculta o total financeiro e apresenta "Reembolso solicitado", não as informações financeiras finais exigidas.',
);

defineBlockedCase(
  'MC-ET038-CT002',
  'RESHIPMENT_COMPLETED não possui apresentação própria; o frontend cai no estado visual inicial e não mostra informações logísticas finais.',
);

defineFlowCase('MC-ET038-CT003', async (context) => {
  let seededReturn!: ReturnItem;
  await test.step('Preparar devolução concluída por cancelamento', async () => {
    seededReturn = await prepareSeededReturn(context, 'REQUEST_CANCELLED');
  });

  await test.step('Acessar os detalhes da devolução', async () => {
    await openReturnDetails(context, seededReturn);
  });

  await test.step('Apresentar o desfecho final cancelado sem ações incompatíveis', async () => {
    await expect(context.page.getByText('Devolução cancelada', { exact: true })).toBeVisible();
    await expect(context.page.getByText('Sua solicitação de devolução foi cancelada', { exact: true })).toBeVisible();
    await expect(context.page.getByRole('button', { name: 'cancelar devolução', exact: true })).toHaveCount(0);
  });
});

defineBlockedCase(
  'MC-ET038-CT004',
  'O frontend não preserva todos os estados finais canônicos: REFUND_APPROVED e RESHIPMENT_COMPLETED caem no estado visual inicial, e payloads visuais não têm validação de integridade própria.',
);
