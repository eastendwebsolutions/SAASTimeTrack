import { getEnv } from "@/lib/env";
import { BILLING_ALLOWED_EXTENSIONS, BILLING_ALLOWED_MIME_TYPES, getFileExtension, sanitizeFileName } from "@/lib/validation/billing";
import { uploadBlobFile } from "./blob";

export type StoredBillingFile = {
  originalFileName: string;
  storedFileName: string;
  fileMimeType: string;
  fileSizeBytes: number;
  storagePath: string;
};

export function validateUploadFile(file: File) {
  const extension = getFileExtension(file.name);
  const maxBytes = Number(getEnv().BILLING_MAX_FILE_SIZE_BYTES ?? 10 * 1024 * 1024);

  if (!BILLING_ALLOWED_EXTENSIONS.includes(extension as (typeof BILLING_ALLOWED_EXTENSIONS)[number])) {
    throw new Error(`Unsupported file type for ${file.name}`);
  }
  if (file.size > maxBytes) {
    throw new Error(`${file.name} exceeds max allowed size`);
  }
  if (!BILLING_ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error(`Unsupported MIME type for ${file.name}`);
  }
}

export async function storeBillingFiles({
  files,
  companyId,
  userId,
  billingPeriodId,
}: {
  files: File[];
  companyId: string;
  userId: string;
  billingPeriodId: string;
}): Promise<StoredBillingFile[]> {
  const stored: StoredBillingFile[] = [];

  for (const file of files) {
    validateUploadFile(file);
    const safeName = sanitizeFileName(file.name);
    const blob = await uploadBlobFile({
      fileName: safeName,
      file,
      companyId,
      userId,
      billingPeriodId,
    });

    stored.push({
      originalFileName: file.name,
      storedFileName: blob.storedFileName,
      fileMimeType: file.type,
      fileSizeBytes: file.size,
      storagePath: blob.storagePath,
    });
  }

  return stored;
}

