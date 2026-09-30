export interface StoredPdfInfo {
  size: number;
  contentType: string;
}

export function readStoredPdfInfo(info: unknown): StoredPdfInfo | null;
