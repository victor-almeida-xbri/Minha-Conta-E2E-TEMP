import flowCasesJson from '../../requirements/flow-cases.json' with { type: 'json' };

export type FlowCase = {
  id: string;
  specification: string;
  caseCode: string;
  name: string;
  title: string;
  type: string;
  severity: 'Crítico' | 'Alto' | 'Médio' | 'Baixo';
  objective: string;
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
  layers: string[];
};

export const flowCases = flowCasesJson as FlowCase[];
export const flowCaseById = new Map(flowCases.map((testCase) => [testCase.id, testCase]));

export function casesForSpecifications(...specifications: string[]): FlowCase[] {
  const selected = new Set(specifications);
  return flowCases.filter((testCase) => selected.has(testCase.specification));
}
