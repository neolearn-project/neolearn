const SIZE_FIELDS = ["size", "contentLength"];
const MIME_FIELDS = ["contentType", "content_type", "mimetype", "mimeType"];

function presentValues(object, fields) {
  if (!object || typeof object !== "object" || Array.isArray(object)) return [];
  return fields
    .filter((field) => Object.prototype.hasOwnProperty.call(object, field) && object[field] !== undefined && object[field] !== null)
    .map((field) => object[field]);
}

function parseByteSize(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function parseMimeType(value) {
  if (typeof value !== "string") return null;
  const mimeType = value.split(";", 1)[0].trim().toLowerCase();
  return mimeType || null;
}

/**
 * Normalize Supabase Storage info() responses from both FileObjectV2
 * (root-level size/contentType) and legacy FileObject (metadata.size/mimetype).
 * Conflicting or malformed metadata is rejected instead of preferring whichever
 * field happens to be truthy.
 *
 * @param {unknown} info
 * @returns {{ size: number, contentType: string } | null}
 */
export function readStoredPdfInfo(info) {
  if (!info || typeof info !== "object" || Array.isArray(info)) return null;

  const metadata = info.metadata;
  const sizes = [
    ...presentValues(info, SIZE_FIELDS),
    ...presentValues(metadata, SIZE_FIELDS),
  ];
  const mimeTypes = [
    ...presentValues(info, MIME_FIELDS),
    ...presentValues(metadata, MIME_FIELDS),
  ];

  if (sizes.length === 0 || mimeTypes.length === 0) return null;

  const parsedSizes = sizes.map(parseByteSize);
  const parsedMimeTypes = mimeTypes.map(parseMimeType);
  if (parsedSizes.some((size) => size === null) || parsedMimeTypes.some((mimeType) => mimeType === null)) {
    return null;
  }
  if (new Set(parsedSizes).size !== 1 || new Set(parsedMimeTypes).size !== 1) return null;

  return { size: parsedSizes[0], contentType: parsedMimeTypes[0] };
}
