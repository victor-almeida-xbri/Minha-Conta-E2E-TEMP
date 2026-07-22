import { expect, type Page } from '@playwright/test';

export async function openAccountSection(page: Page, sectionName: RegExp | string): Promise<void> {
  const menuItem = page.getByRole('button', { name: sectionName }).or(page.getByRole('link', { name: sectionName }));
  await expect(menuItem.first()).toBeVisible();
  await menuItem.first().click();
}

export async function expectNoServerError(page: Page): Promise<void> {
  await expect(page.getByText(/erro interno|internal server error|unexpected error/i)).toHaveCount(0);
}
