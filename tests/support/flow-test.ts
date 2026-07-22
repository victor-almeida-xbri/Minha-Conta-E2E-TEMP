import { expect, test as base, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { flowCaseById, type FlowCase } from './contract.js';

export type FlowContext = {
  page: Page;
  request: APIRequestContext;
  testInfo: TestInfo;
  testCase: FlowCase;
  frontendUrl: string;
  backendUrl: string;
};

export type FlowHandler = (context: FlowContext) => Promise<void>;

export const test = base;
export { expect };

export function defineFlowCase(id: string, handler: FlowHandler): void {
  const testCase = flowCaseById.get(id);
  if (!testCase) throw new Error(`Caso fora do manifesto: ${id}`);

  test(`[${id}] ${testCase.name}`, async ({ page, request }, testInfo) => {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:4200';
    const backendUrl = process.env.BACKEND_URL ?? 'http://127.0.0.1:80';
    await handler({ page, request, testInfo, testCase, frontendUrl, backendUrl });
  });
}

export function defineBlockedCase(id: string, reason: string): void {
  defineFlowCase(id, async ({ testCase }) => {
    test.info().annotations.push({ type: 'blocked-contract', description: reason });
    test.fixme(true, `${testCase.id}: ${reason}`);
  });
}

export async function runDocumentedSteps(testCase: FlowCase, action: (step: string) => Promise<void>): Promise<void> {
  for (const step of testCase.steps) {
    await test.step(step, async () => action(step));
  }
}
