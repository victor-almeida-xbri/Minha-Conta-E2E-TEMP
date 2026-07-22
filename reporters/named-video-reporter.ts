import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const videosDir = path.join(projectRoot, 'videos');

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

function formatTimestamp(date: Date): string {
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`,
  ].join('_');
}

function sanitizeFilename(value: string, maxLength = 120): string {
  return value
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
}

export default class NamedVideoReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult): void {
    const videoAttachments = result.attachments.filter(
      (attachment) => attachment.name === 'video' || attachment.contentType.startsWith('video/'),
    );

    if (videoAttachments.length === 0) return;

    mkdirSync(videosDir, { recursive: true });

    const timestamp = formatTimestamp(result.startTime);
    const testName = sanitizeFilename(test.title) || 'teste-sem-nome';
    const projectName = sanitizeFilename(test.parent.project()?.name ?? 'projeto');
    const retry = result.retry > 0 ? `__retry-${result.retry}` : '';

    videoAttachments.forEach((attachment, index) => {
      const extraVideo = index > 0 ? `__video-${index + 1}` : '';
      const extension = attachment.path ? path.extname(attachment.path) || '.webm' : '.webm';
      const filename = `${timestamp}__${testName}__${projectName}__${result.status}${retry}${extraVideo}${extension}`;
      const destination = path.join(videosDir, filename);

      if (attachment.path) {
        copyFileSync(attachment.path, destination);
      } else if (attachment.body) {
        writeFileSync(destination, attachment.body);
      }
    });
  }

  printsToStdio(): boolean {
    return false;
  }
}
