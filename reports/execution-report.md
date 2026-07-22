# Relatório de execução — DOC-DEV-027 Minha Conta

Data: 2026-07-21

## Escopo implementado

- 145 casos de fluxo normalizados a partir do CSV, com um `test()` por `Código Composto`.
- 90 casos técnicos preservados em `requirements/excluded-cases.json` e excluídos da suíte de fluxo.
- Projetos Chromium, Firefox e WebKit, totalizando 435 entradas rastreáveis.
- Frontend `http://127.0.0.1:4200` e backend `http://127.0.0.1:80`.
- 75 casos executáveis e 70 casos marcados `blocked-contract` com justificativa técnica.

## Validações aprovadas

- `npm run typecheck`: aprovado.
- `npm run traceability`: 145 códigos únicos em cada projeto e 435 execuções listadas, sem ausências, extras ou duplicações.
- Cinco seeders PHP: sintaxe aprovada e execução concluída.
- Seeder principal executado duas vezes consecutivas com sucesso, comprovando idempotência operacional.
- Massa após execução: 436 contas (435 casos/navegadores + sentinela), 216 pedidos e 114 devoluções.
- Conta sentinela autenticada pelo setup global no mesmo backend da porta 80.
- Amostra transversal com um worker: 21/21 aprovados, sete fluxos em Chromium, Firefox e WebKit.

Fluxos da amostra: MC-ET001-CT001, MC-ET004-CT008, MC-ET006-CT001, MC-ET008-CT002, MC-ET014-CT002, MC-ET019-CT002 e MC-ET030-CT002.

## Regressão Chromium com três workers

Resultado final da rodada completa:

- 51 aprovados.
- 24 falhas.
- 70 bloqueados/skipped por divergência produto x contrato ou dependência inexistente.

As 24 falhas restantes foram:

- Conta/navegação: MC-ET003-CT001, MC-ET003-CT004, MC-ET004-CT001, MC-ET005-CT001, MC-ET005-CT005, MC-ET006-CT002, MC-ET007-CT006 e MC-ET039-CT001.
- Endereços: MC-ET015-CT008, MC-ET016-CT001, MC-ET016-CT002, MC-ET016-CT008 e MC-ET018-CT005.
- Devoluções: MC-ET030-CT002 e MC-ET034-CT001.
- Veículos: MC-ET009-CT004, MC-ET009-CT006, MC-ET010-CT001, MC-ET010-CT002, MC-ET010-CT003, MC-ET011-CT001, MC-ET011-CT002, MC-ET011-CT003 e MC-ET013-CT004.

Parte dessas falhas é específica da execução concorrente: MC-ET003-CT001, MC-ET004-CT001, MC-ET030-CT002 e outros fluxos representativos passaram isoladamente com um worker. A execução com três workers sobrecarregou o frontend local e produziu timeouts de navegação/API. Os fluxos de veículo que editam dados sintéticos também dependem de opções existentes no catálogo dinâmico; os valores dos veículos semeados não são necessariamente opções retornadas pelo catálogo local.

MC-ET006-CT002 confirmou uma divergência observável: o CNPJ é exibido sem máscara, embora o contrato espere a apresentação formatada.

A regressão completa nos três navegadores e a segunda repetição integral não foram consideradas aprovadas, pois repetiriam as 24 falhas já reproduzidas no Chromium. A matriz estrutural de 435 casos e a amostra real nos três motores foram validadas.

## Bloqueios contratuais

Os 70 casos bloqueados permanecem listados pelo Playwright e não são falsos positivos. Os principais grupos são:

- limiar reCAPTCHA não observável no ambiente local;
- estados vazios e ações ausentes na UI;
- PIX estático e ausência de emulador Pagar.me local;
- NF-e e rastreamento sem handlers/endpoints consumidos pela UI;
- fluxo de devolução sem `request_type` completo;
- cobrança de frete, tracking, documentos e estados de devolução/reenvio não representados na interface.

## Integridade da entrega

- Nenhuma lógica do frontend foi alterada.
- Nenhuma lógica do backend foi alterada.
- O backend recebeu somente cinco arquivos novos em `database/seeders/DocDev027*.php`.
- Não foram criados endpoints, comandos Artisan, migrations, dependências de produto ou `data-testid`.
- A ponte `localhost` para `127.0.0.1:80` e o mock de reCAPTCHA existem somente dentro do Playwright para compatibilizar o ambiente local.
