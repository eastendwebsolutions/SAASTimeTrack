import { del, put } from "@vercel/blob";

export type UploadedBlobResult = {
  storagePath: string;
  storedFileName: string;
};

export async function uploadBlobFile({
  fileName,
  file,
  companyId,
  userId,
  billingPeriodId,
}: {
  fileName: string;
  file: File;
  companyId: string;
  userId: string;
  billingPeriodId: string;
}): Promise<UploadedBlobResult> {
  const storagePath = `billing/${companyId}/${userId}/${billingPeriodId}/${Date.now()}-${fileName}`;
  const result = await put(storagePath, file, {
    access: "private",
    addRandomSuffix: false,
    contentType: file.type || "application/octet-stream",
  });

  return { storagePath: result.url, storedFileName: fileName };
}

export async function deleteBlobFile(storagePath: string) {
  await del(storagePath);
}

