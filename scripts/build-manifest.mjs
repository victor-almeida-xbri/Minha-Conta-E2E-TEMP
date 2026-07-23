import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, splitDocumentedText } from './csv-utils.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = path.join(rootDir, 'requirements', 'DOC-DEV-027-casos-de-teste.csv');
const rows = parseCsv((await readFile(csvPath, 'utf8')).replace(/^\uFEFF/, ''));
let currentSpecification = '';

const normalized = rows.map((row) => {
  currentSpecification = row['Especificação'] || currentSpecification;
  const id = row['Código Composto'];
  if (!/^MC-ET\d{3}-CT\d{3}$/.test(id)) throw new Error(`Codigo composto invalido: ${id}`);
  return {
    id,
    specification: currentSpecification,
    caseCode: row['Código CT'] || id.slice(-5),
    name: row.Nome,
    title: row.Título || `${id.slice(-5)} ${row.Nome}`,
    type: row.Tipos,
    severity: row.Severidade,
    objective: row.Objetivo,
    preconditions: splitDocumentedText(row['Pré-condições']),
    steps: splitDocumentedText(row.Passos),
    expectedResults: splitDocumentedText(row['Resultados esperados']),
    layers: splitDocumentedText(row['Camadas validadas'].replace(/,\s*/g, '; ')),
  };
});

const selected = normalized.filter(
  (testCase) => testCase.layers.includes('Frontend') || testCase.id === 'MC-ET020-CT003',
);
const excluded = normalized.filter((testCase) => !selected.includes(testCase));
const ids = selected.map(({ id }) => id);

if (normalized.length !== 237) throw new Error(`Esperados 237 casos; encontrados ${normalized.length}`);
if (selected.length !== 147) throw new Error(`Esperados 147 fluxos; encontrados ${selected.length}`);
if (new Set(ids).size !== ids.length) throw new Error('Existem codigos duplicados no recorte de fluxos');

await mkdir(path.dirname(csvPath), { recursive: true });
await Promise.all([
  writeFile(path.join(rootDir, 'requirements', 'flow-cases.json'), `${JSON.stringify(selected, null, 2)}\n`),
  writeFile(path.join(rootDir, 'requirements', 'excluded-cases.json'), `${JSON.stringify(excluded, null, 2)}\n`),
]);

console.log(`Manifesto gerado: ${selected.length} fluxos; ${excluded.length} casos tecnicos excluidos.`);
