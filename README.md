# DOC-DEV-027 — Minha Conta E2E

Suite Playwright rastreada ao CSV do DOC-DEV-027. A aplicacao deve estar em execucao antes dos testes.

## Ambiente

1. Copie `.env.example` para `.env` e ajuste `BACKEND_PATH`/`BACKEND_ENV`/`E2E_SENTINEL_PASSWORD`.
2. Confirme o frontend em `http://127.0.0.1:4200`.
3. Confirme o backend em `http://127.0.0.1:80/api/v1/vehicle/brands`.

Para regressões repetidas, use `npm run test:twice`. O comando reaplica as massas antes de cada execução, pois alguns fluxos validam exclusão e alteração persistente em contas exclusivas por caso e navegador.
4. Execute `npm run seed` para preparar apenas as massas DOC-DEV-027.

## Comandos

- `npm run manifest:build`: normaliza o CSV em 147 fluxos e 90 casos técnicos excluídos.
- `npm run typecheck`: valida TypeScript.
- `npm run traceability`: exige exatamente um teste por fluxo no Chromium.
- `npm run test:chromium`: executa os 147 fluxos no Chromium.
- `npm test`: executa 441 combinações nos três navegadores.
- `npm run test:debug -- -g "MC-ET001-CT001"`: execução visual focada.

Os testes não iniciam servidores e não alteram lógica do frontend/backend. Fora deste repositório, somente seeders novos dedicados ao DOC-DEV-027 são permitidos.
