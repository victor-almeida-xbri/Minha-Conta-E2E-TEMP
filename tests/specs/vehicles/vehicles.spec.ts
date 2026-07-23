import { type Locator, type Page } from '@playwright/test';
import { accountForCase, bearerHeaders, loginCustomerByApi } from '../../support/auth.js';
import { defineBlockedCase, defineFlowCase, expect, test, type FlowContext } from '../../support/flow-test.js';

type Vehicle = {
  id: number;
  user_id: number;
  brand: string;
  model: string;
  year: string;
  version: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

type VehicleData = Pick<Vehicle, 'brand' | 'model' | 'year' | 'version'>;

async function loginAndOpenVehicles(context: FlowContext): Promise<void> {
  await loginCustomerByApi(
    context.page,
    context.request,
    accountForCase(context.testCase.id, context.testInfo.project.name),
  );
  await context.page.goto('/minha-conta/meus-veiculos');
  await expect(context.page.getByText(/Veículos cadastrados|Nenhum veículo cadastrado/)).toBeVisible();
}

async function readVehicles(page: Page, backendUrl: string): Promise<Vehicle[]> {
  const response = await page.request.get(`${backendUrl}/api/v1/accounts/vehicles/list`, {
    headers: await bearerHeaders(page),
  });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { data: Vehicle[] }).data;
}

function vehicleRow(page: Page, vehicle: VehicleData): Locator {
  return page.locator('app-vehicle-card').filter({ hasText: `${vehicle.model} ${vehicle.year}` }).first();
}

async function openVehicleMenu(page: Page, row: Locator): Promise<Locator> {
  await row.locator('mat-icon.actions__options').click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}

async function openRegistration(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /Adicionar (novo )?veículo/i }).click();
  const modal = page.locator('.modal-overlay:visible');
  await expect(modal.getByText('COMO DESEJA ADICIONAR O VEÍCULO?')).toBeVisible();
  return modal;
}

async function registerByPlate(page: Page, plate: string) {
  const modal = await openRegistration(page);
  await modal.getByPlaceholder('ABC-0000').fill(plate);
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/v1/accounts/vehicles/register') && response.request().method() === 'POST',
  );
  await modal.getByRole('button', { name: 'Cadastrar veículo' }).click();
  return responsePromise;
}

function modelSelector(modal: Locator, field: string): Locator {
  return modal.locator(`app-custom-selector:has(input[placeholder="${field}"])`);
}

async function chooseCustomSelector(modal: Locator, field: string, preferred?: string): Promise<string> {
  const selector = modelSelector(modal, field);
  const isDesktopSelector = (await selector.count()) > 0;

  if (isDesktopSelector) {
    await selector.locator(`input[placeholder="${field}"]`).click();
  } else {
    const sidenav = modal.locator('.sidenav-container:visible');
    if ((await sidenav.count()) === 0) {
      await modal.locator(`input[placeholder="${field}"]`).click();
    }
    await expect(sidenav).toBeVisible();
  }

  const options = isDesktopSelector
    ? selector.locator('.wrapper-selector__dropdown-body-item, .wrapper-selector__dropdown-body-item-container')
    : modal.locator(
      '.sidenav-container:visible .search-options__body-item, ' +
      '.sidenav-container:visible .search-options__body-item-container',
    );
  await expect(options.first()).toBeVisible();
  const option = preferred ? options.filter({ hasText: preferred }).first() : options.first();
  const label = (await option.innerText()).trim();
  await option.click();
  return preferred ?? label;
}

async function openModelRegistration(page: Page): Promise<Locator> {
  const modal = await openRegistration(page);
  await modal.getByText('Modelo do veículo', { exact: true }).click();
  await expect(modal.locator('input[placeholder="Marca"]')).toBeVisible();
  return modal;
}

async function selectModelCascade(page: Page, modal: Locator, preferred?: VehicleData): Promise<VehicleData> {
  const modelsResponse = page.waitForResponse((response) => response.url().includes('/api/v1/vehicle/models'));
  const brand = await chooseCustomSelector(modal, 'Marca', preferred?.brand);
  await modelsResponse;
  const yearsResponse = page.waitForResponse((response) => response.url().includes('/api/v1/vehicle/years'));
  const model = await chooseCustomSelector(modal, 'Modelo', preferred?.model);
  await yearsResponse;
  const versionsResponse = page.waitForResponse((response) => response.url().includes('/api/v1/vehicle/versions'));
  const year = await chooseCustomSelector(modal, 'Ano', preferred?.year);
  await versionsResponse;
  const version = await chooseCustomSelector(modal, 'Versão', preferred?.version);
  return { brand, model, year, version };
}

async function openEditVehicle(page: Page, vehicle: Vehicle): Promise<Locator> {
  const menu = await openVehicleMenu(page, vehicleRow(page, vehicle));
  await menu.getByText('Editar', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Editar veículo')).toBeVisible();
  return dialog;
}

async function chooseMatSelect(page: Page, dialog: Locator, control: string, label: string): Promise<void> {
  await dialog.locator(`mat-select[formcontrolname="${control}"]`).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

async function deleteVehicle(page: Page, vehicle: Vehicle): Promise<void> {
  const menu = await openVehicleMenu(page, vehicleRow(page, vehicle));
  await menu.getByText('Excluir', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Tem certeza que deseja excluir este veículo?')).toBeVisible();
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes(`/api/v1/accounts/vehicles/${vehicle.id}`) && response.request().method() === 'DELETE',
  );
  await dialog.getByRole('button', { name: 'Sim', exact: true }).click();
  expect((await responsePromise).status()).toBe(204);
}

defineFlowCase('MC-ET008-CT001', async (context) => {
  await loginAndOpenVehicles(context);
  await expect(context.page.getByText('Nenhum veículo cadastrado')).toBeVisible();
  await expect(context.page.getByRole('button', { name: 'Adicionar novo veículo' })).toBeVisible();
  await expect(context.page.locator('app-vehicle-card')).toHaveCount(0);
});

defineFlowCase('MC-ET008-CT002', async (context) => {
  await loginAndOpenVehicles(context);
  const vehicles = await readVehicles(context.page, context.backendUrl);
  expect(vehicles.length).toBeGreaterThanOrEqual(2);
  await expect(context.page.locator('app-vehicle-card')).toHaveCount(vehicles.length);
  await expect(context.page.getByText('Veículo principal')).toHaveCount(1);
  expect(vehicles.filter((vehicle) => vehicle.is_primary)).toHaveLength(1);
});

// Test is passing but there is no chack before registering a vehicle
defineFlowCase('MC-ET009-CT001', async (context) => {
  await context.page.route('**/api/v1/cart', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null }) });
      return;
    }
    await route.continue();
  });
  await loginAndOpenVehicles(context);
  const vehiclesBefore = await readVehicles(context.page, context.backendUrl);
  expect(vehiclesBefore).toHaveLength(0);

  const plate = 'EAX9422';
  const response = await registerByPlate(context.page, plate);
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toEqual({ plate });

  const payload = (await response.json()) as { data: Vehicle };
  expect(payload.data).toEqual(
    expect.objectContaining({
      id: expect.any(Number),
      brand: expect.any(String),
      model: expect.any(String),
      year: expect.any(String),
      version: expect.any(String),
    }),
  );
  expect(payload.data.brand).not.toBe('');
  expect(payload.data.model).not.toBe('');
  expect(payload.data.year).not.toBe('');
  expect(payload.data.version).not.toBe('');

  const vehiclesAfter = await readVehicles(context.page, context.backendUrl);
  expect(vehiclesAfter).toHaveLength(vehiclesBefore.length + 1);
  expect(vehiclesAfter).toContainEqual(expect.objectContaining(payload.data));
  await expect(vehicleRow(context.page, payload.data)).toBeVisible();
});

defineFlowCase('MC-ET009-CT002', async (context) => {
  await loginAndOpenVehicles(context);
  const vehiclesBefore = await readVehicles(context.page, context.backendUrl);
  const plate = 'ZZZ9Z99';
  const formattedPlate = 'ZZZ-9Z99';
  const notFoundMessage = 'Veículo não encontrado.';

  await context.page.route('**/api/v1/accounts/vehicles/register', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ plate });
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: notFoundMessage }),
    });
  });

  const modal = await openRegistration(context.page);
  const plateInput = modal.getByPlaceholder('ABC-0000');
  await plateInput.fill(plate);
  const responsePromise = context.page.waitForResponse(
    (response) => response.url().includes('/api/v1/accounts/vehicles/register') && response.request().method() === 'POST',
  );
  await modal.getByRole('button', { name: 'Cadastrar veículo' }).click();
  const response = await responsePromise;

  expect(response.status()).toBe(404);
  await expect(modal).toBeVisible();
  await expect(plateInput).toHaveValue(formattedPlate);
  expect(await readVehicles(context.page, context.backendUrl)).toEqual(vehiclesBefore);
  await expect(modal.getByText(notFoundMessage, { exact: true })).toBeVisible();
});

defineFlowCase('MC-ET009-CT003', async (context) => {
  await loginAndOpenVehicles(context);
  const vehiclesBefore = await readVehicles(context.page, context.backendUrl);
  let registrationRequests = 0;

  await context.page.route('**/api/v1/accounts/vehicles/register', async (route) => {
    if (route.request().method() === 'POST') {
      registrationRequests += 1;
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Formato de placa inválido.' }),
      });
      return;
    }
    await route.continue();
  });

  const modal = await openRegistration(context.page);
  const plateInput = modal.getByPlaceholder('ABC-0000');
  await plateInput.fill('ABC12');
  await expect(plateInput).toHaveValue('ABC-12');
  await modal.getByRole('button', { name: 'Cadastrar veículo' }).click();

  await expect(
    modal.getByText(/placa.*(?:válida|inválid)|formato.*placa/i),
  ).toBeVisible();
  expect(registrationRequests).toBe(0);
  expect(await readVehicles(context.page, context.backendUrl)).toEqual(vehiclesBefore);
  await expect(modal).toBeVisible();
});

defineFlowCase('MC-ET009-CT004', async (context) => {
  await loginAndOpenVehicles(context);
  const countBefore = (await readVehicles(context.page, context.backendUrl)).length;
  await context.page.route('**/api/v1/accounts/vehicles/register', async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'indisponível' }) });
  });
  await registerByPlate(context.page, 'E2E0E00');
  await expect(context.page.getByText('Ocorreu um erro ao cadastrar o veículo. Por favor, tente novamente.')).toBeVisible();
  expect((await readVehicles(context.page, context.backendUrl)).length).toBe(countBefore);
});

defineFlowCase('MC-ET009-CT005', async (context) => {
  await loginAndOpenVehicles(context);
  const vehiclesBefore = await readVehicles(context.page, context.backendUrl);
  const plate = 'EAX9422';

  const firstResponse = await registerByPlate(context.page, plate);
  expect(firstResponse.status()).toBe(201);
  expect(firstResponse.request().postDataJSON()).toEqual({ plate });

  const vehiclesAfterFirstAttempt = await readVehicles(context.page, context.backendUrl);
  expect(vehiclesAfterFirstAttempt).toHaveLength(vehiclesBefore.length + 1);

  const secondResponse = await registerByPlate(context.page, plate);
  expect(secondResponse.request().postDataJSON()).toEqual({ plate });

  const secondAttemptFailed = secondResponse.status() >= 400 && secondResponse.status() < 500;
  expect.soft(
    secondAttemptFailed,
    `a segunda tentativa deveria retornar erro 4xx, mas retornou HTTP ${secondResponse.status()}`,
  ).toBe(true);

  if (secondAttemptFailed) {
    await expect.soft(
      context.page.getByText('Ocorreu um erro ao cadastrar o veículo. Por favor, tente novamente.'),
    ).toBeVisible();
  }

  const vehiclesAfterSecondAttempt = await readVehicles(context.page, context.backendUrl);
  expect.soft(
    vehiclesAfterSecondAttempt,
    'a segunda tentativa não deve criar outro veículo',
  ).toHaveLength(vehiclesAfterFirstAttempt.length);
});

defineFlowCase('MC-ET009-CT006', async (context) => {
  await loginAndOpenVehicles(context);
  expect(await readVehicles(context.page, context.backendUrl)).toHaveLength(0);
  const response = await registerByPlate(context.page, 'EAX9422');
  expect(response.status()).toBe(201);
  await expect(context.page.getByText('Veículos cadastrados')).toBeVisible();
  const vehicles = await readVehicles(context.page, context.backendUrl);
  expect(vehicles).toHaveLength(1);
  expect(vehicles[0].is_primary).toBe(true);
  await expect(vehicleRow(context.page, vehicles[0]).getByText('Veículo principal')).toBeVisible();
});

defineFlowCase('MC-ET009-CT010', async (context) => {
  await loginAndOpenVehicles(context);
  const vehiclesBefore = await readVehicles(context.page, context.backendUrl);
  expect(vehiclesBefore).toHaveLength(1);
  const principalBefore = vehiclesBefore.find((vehicle) => vehicle.is_primary);
  expect(principalBefore).toBeTruthy();

  const response = await registerByPlate(context.page, 'EAX9422');
  expect(response.status()).toBe(201);
  const payload = (await response.json()) as { data: Vehicle };
  const vehiclesAfter = await readVehicles(context.page, context.backendUrl);
  const created = vehiclesAfter.find((vehicle) => vehicle.id === payload.data.id);

  expect(vehiclesAfter).toHaveLength(vehiclesBefore.length + 1);
  expect(created).toBeTruthy();
  expect(
    vehiclesAfter.filter((vehicle) => vehicle.is_primary),
    'deve permanecer exatamente um veículo principal',
  ).toHaveLength(1);
  expect(
    vehiclesAfter.find((vehicle) => vehicle.is_primary)?.id,
    'o veículo principal anterior deve ser preservado',
  ).toBe(principalBefore!.id);
  expect(created!.is_primary, 'o novo veículo deve ser cadastrado como secundário').toBe(false);
  await expect(vehicleRow(context.page, principalBefore!).getByText('Veículo principal')).toBeVisible();
});

defineFlowCase('MC-ET010-CT001', async (context) => {
  await loginAndOpenVehicles(context);
  const modal = await openModelRegistration(context.page);
  await expect(modal.locator('input[placeholder="Marca"]')).toBeEnabled();
  await expect(modal.locator('input[placeholder="Modelo"]')).toBeDisabled();
  await expect(modal.locator('input[placeholder="Ano"]')).toBeDisabled();
  await expect(modal.locator('input[placeholder="Versão"]')).toBeDisabled();
  await selectModelCascade(context.page, modal);
  await expect(modal.locator('input[placeholder="Modelo"]')).toBeEnabled();
  await expect(modal.locator('input[placeholder="Ano"]')).toBeEnabled();
  await expect(modal.locator('input[placeholder="Versão"]')).toBeEnabled();
  const previousModel = await modal.locator('input[placeholder="Modelo"]').inputValue();
  const modelsResponse = context.page.waitForResponse((response) => response.url().includes('/api/v1/vehicle/models'));
  await chooseCustomSelector(modal, 'Marca');
  await modelsResponse;
  await expect(modal.locator('input[placeholder="Modelo"]')).toHaveValue('');
  expect(previousModel).not.toBe('');
});

defineFlowCase('MC-ET010-CT002', async (context) => {
  await loginAndOpenVehicles(context);
  const countBefore = (await readVehicles(context.page, context.backendUrl)).length;
  const modal = await openModelRegistration(context.page);
  const selected = await selectModelCascade(context.page, modal);
  const responsePromise = context.page.waitForResponse(
    (response) => response.url().includes('/api/v1/accounts/vehicles/register') && response.request().method() === 'POST',
  );
  await modal.getByRole('button', { name: 'Cadastrar veículo' }).click();
  expect((await responsePromise).status()).toBe(201);
  await expect(vehicleRow(context.page, selected)).toBeVisible();
  expect((await readVehicles(context.page, context.backendUrl)).length).toBe(countBefore + 1);
});

defineFlowCase('MC-ET010-CT003', async (context) => {
  await loginAndOpenVehicles(context);
  const countBefore = (await readVehicles(context.page, context.backendUrl)).length;
  const modal = await openModelRegistration(context.page);
  let registrations = 0;
  await context.page.route('**/api/v1/accounts/vehicles/register', async (route) => {
    registrations += 1;
    await route.continue();
  });
  await modal.getByRole('button', { name: 'Cadastrar veículo' }).click();
  await expect(modal.getByText('Por favor, preencha todos os campos do modelo do veículo.')).toBeVisible();
  expect(registrations).toBe(0);
  expect((await readVehicles(context.page, context.backendUrl)).length).toBe(countBefore);
});

defineBlockedCase(
  'MC-ET010-CT004',
  'O backend real não valida duplicidade da combinação brand/model/year/version; o mesmo veículo pode ser cadastrado novamente.',
);

defineFlowCase('MC-ET011-CT001', async (context) => {
  await loginAndOpenVehicles(context);
  const [vehicle] = await readVehicles(context.page, context.backendUrl);
  expect(vehicle).toBeTruthy();
  const dialog = await openEditVehicle(context.page, vehicle);
  await expect(dialog.locator('mat-select[formcontrolname="brand"]')).toContainText(vehicle.brand);
  await expect(dialog.locator('mat-select[formcontrolname="model"]')).toContainText(vehicle.model);
  await expect(dialog.locator('mat-select[formcontrolname="year"]')).toContainText(vehicle.year);
  await expect(dialog.locator('mat-select[formcontrolname="version"]')).toContainText(vehicle.version);
});

defineFlowCase('MC-ET011-CT002', async (context) => {
  await loginAndOpenVehicles(context);
  const [vehicle] = await readVehicles(context.page, context.backendUrl);
  expect(vehicle).toBeTruthy();
  const dialog = await openEditVehicle(context.page, vehicle);
  const brandSelect = dialog.locator('mat-select[formcontrolname="brand"]');
  await brandSelect.click();
  const alternatives = context.page.getByRole('option').filter({ hasNotText: vehicle.brand });
  await expect(alternatives.first()).toBeVisible();
  const modelsResponse = context.page.waitForResponse((response) => response.url().includes('/api/v1/vehicle/models'));
  await alternatives.first().click();
  await modelsResponse;
  await expect(dialog.locator('mat-select[formcontrolname="model"]')).toHaveText('');
  await expect(dialog.locator('mat-select[formcontrolname="year"]')).toHaveText('');
  await expect(dialog.locator('mat-select[formcontrolname="version"]')).toHaveText('');
});

defineFlowCase('MC-ET011-CT003', async (context) => {
  await loginAndOpenVehicles(context);
  const [vehicle] = await readVehicles(context.page, context.backendUrl);
  expect(vehicle).toBeTruthy();
  const dialog = await openEditVehicle(context.page, vehicle);
  await dialog.locator('mat-select[formcontrolname="brand"]').click();
  const brandOption = context.page.getByRole('option').filter({ hasNotText: vehicle.brand }).first();
  const brand = (await brandOption.innerText()).trim();
  const modelsResponse = context.page.waitForResponse((response) => response.url().includes('/api/v1/vehicle/models'));
  await brandOption.click();
  await modelsResponse;
  await dialog.locator('mat-select[formcontrolname="model"]').click();
  const modelOption = context.page.getByRole('option').first();
  const model = (await modelOption.innerText()).trim();
  const yearsResponse = context.page.waitForResponse((response) => response.url().includes('/api/v1/vehicle/years'));
  await modelOption.click();
  await yearsResponse;
  await dialog.locator('mat-select[formcontrolname="year"]').click();
  const yearOption = context.page.getByRole('option').first();
  const year = (await yearOption.innerText()).trim();
  const versionsResponse = context.page.waitForResponse((response) => response.url().includes('/api/v1/vehicle/versions'));
  await yearOption.click();
  await versionsResponse;
  await dialog.locator('mat-select[formcontrolname="version"]').click();
  const versionOption = context.page.getByRole('option').first();
  const version = (await versionOption.innerText()).trim();
  await versionOption.click();
  const responsePromise = context.page.waitForResponse(
    (response) => response.url().includes(`/api/v1/accounts/vehicles/${vehicle.id}`) && response.request().method() === 'PUT',
  );
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  expect((await responsePromise).ok()).toBeTruthy();
  await expect(vehicleRow(context.page, { brand, model, year, version })).toBeVisible();
  expect((await readVehicles(context.page, context.backendUrl)).find((candidate) => candidate.id === vehicle.id)).toEqual(
    expect.objectContaining({ brand, model, year, version }),
  );
});

defineFlowCase('MC-ET011-CT004', async (context) => {
  await loginAndOpenVehicles(context);
  const [vehicle] = await readVehicles(context.page, context.backendUrl);
  expect(vehicle).toBeTruthy();
  const dialog = await openEditVehicle(context.page, vehicle);
  let updates = 0;
  await context.page.route(`**/api/v1/accounts/vehicles/${vehicle.id}`, async (route) => {
    if (route.request().method() === 'PUT') updates += 1;
    await route.continue();
  });
  await dialog.locator('mat-select[formcontrolname="brand"]').click();
  const alternative = context.page.getByRole('option').filter({ hasNotText: vehicle.brand }).first();
  const modelsResponse = context.page.waitForResponse((response) => response.url().includes('/api/v1/vehicle/models'));
  await alternative.click();
  await modelsResponse;
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog.getByText('O modelo é obrigatório.')).toBeVisible();
  expect(updates).toBe(0);
  expect((await readVehicles(context.page, context.backendUrl)).find((candidate) => candidate.id === vehicle.id)).toEqual(vehicle);
});

defineBlockedCase(
  'MC-ET011-CT005',
  'O backend real não impede que uma edição replique brand/model/year/version de outro veículo ativo da mesma conta.',
);

defineFlowCase('MC-ET012-CT001', async (context) => {
  await loginAndOpenVehicles(context);
  const vehicles = await readVehicles(context.page, context.backendUrl);
  const current = vehicles.find((vehicle) => vehicle.is_primary);
  const secondary = vehicles.find((vehicle) => !vehicle.is_primary);
  expect(current).toBeTruthy();
  expect(secondary).toBeTruthy();
  const menu = await openVehicleMenu(context.page, vehicleRow(context.page, secondary!));
  const responsePromise = context.page.waitForResponse(
    (response) => response.url().includes(`/api/v1/accounts/vehicles/${secondary!.id}`) && response.request().method() === 'PUT',
  );
  await menu.getByText('Tornar principal', { exact: true }).click();
  expect((await responsePromise).ok()).toBeTruthy();
  await expect(vehicleRow(context.page, secondary!).getByText('Veículo principal')).toBeVisible();
  const stored = await readVehicles(context.page, context.backendUrl);
  expect(stored.filter((vehicle) => vehicle.is_primary)).toHaveLength(1);
  expect(stored.find((vehicle) => vehicle.is_primary)?.id).toBe(secondary!.id);
});

defineFlowCase('MC-ET012-CT002', async (context) => {
  await loginAndOpenVehicles(context);
  const vehiclesBefore = await readVehicles(context.page, context.backendUrl);
  const principal = vehiclesBefore.find((vehicle) => vehicle.is_primary);
  expect(principal).toBeTruthy();

  const row = vehicleRow(context.page, principal!);
  await expect(row.getByText('Veículo principal')).toBeVisible();
  const menu = await openVehicleMenu(context.page, row);
  await expect.soft(menu.getByText('Tornar principal', { exact: true })).toHaveCount(0);

  const vehiclesAfter = await readVehicles(context.page, context.backendUrl);
  expect(vehiclesAfter.filter((vehicle) => vehicle.is_primary)).toHaveLength(1);
  expect(vehiclesAfter.find((vehicle) => vehicle.is_primary)?.id).toBe(principal!.id);
});

defineFlowCase('MC-ET013-CT001', async (context) => {
  await loginAndOpenVehicles(context);
  const [vehicle] = await readVehicles(context.page, context.backendUrl);
  expect(vehicle).toBeTruthy();
  const menu = await openVehicleMenu(context.page, vehicleRow(context.page, vehicle));
  await menu.getByText('Excluir', { exact: true }).click();
  const dialog = context.page.getByRole('dialog');
  await expect(dialog.getByText('Tem certeza que deseja excluir este veículo?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Não', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(vehicleRow(context.page, vehicle)).toBeVisible();
  expect((await readVehicles(context.page, context.backendUrl)).some((candidate) => candidate.id === vehicle.id)).toBe(true);
});

defineFlowCase('MC-ET013-CT002', async (context) => {
  await loginAndOpenVehicles(context);
  const vehicles = await readVehicles(context.page, context.backendUrl);
  const principal = vehicles.find((vehicle) => vehicle.is_primary);
  const secondary = vehicles.find((vehicle) => !vehicle.is_primary);
  expect(principal).toBeTruthy();
  expect(secondary).toBeTruthy();
  await deleteVehicle(context.page, secondary!);
  await expect(vehicleRow(context.page, secondary!)).toBeHidden();
  await expect(vehicleRow(context.page, principal!).getByText('Veículo principal')).toBeVisible();
  const stored = await readVehicles(context.page, context.backendUrl);
  expect(stored.some((vehicle) => vehicle.id === secondary!.id)).toBe(false);
  expect(stored.find((vehicle) => vehicle.id === principal!.id)?.is_primary).toBe(true);
});

defineFlowCase('MC-ET013-CT003', async (context) => {
  await loginAndOpenVehicles(context);
  const vehicles = await readVehicles(context.page, context.backendUrl);
  const principal = vehicles.find((vehicle) => vehicle.is_primary);
  const replacements = vehicles.filter((vehicle) => !vehicle.is_primary);
  expect(principal).toBeTruthy();
  expect(replacements.length).toBeGreaterThan(0);
  await deleteVehicle(context.page, principal!);
  const stored = await readVehicles(context.page, context.backendUrl);
  expect(stored.some((vehicle) => vehicle.id === principal!.id)).toBe(false);
  expect(stored.filter((vehicle) => vehicle.is_primary)).toHaveLength(1);
  expect(stored.find((vehicle) => vehicle.is_primary)?.id).toBe(Math.max(...replacements.map((vehicle) => vehicle.id)));
});

defineFlowCase('MC-ET013-CT004', async (context) => {
  await loginAndOpenVehicles(context);
  const vehicles = await readVehicles(context.page, context.backendUrl);
  expect(vehicles).toHaveLength(1);
  await deleteVehicle(context.page, vehicles[0]);
  await expect(context.page.getByText('Nenhum veículo cadastrado')).toBeVisible();
  expect(await readVehicles(context.page, context.backendUrl)).toHaveLength(0);
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
