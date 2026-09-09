export const UNIT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const UNIT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const UNIT_IMAGE_MAX_DIMENSION = 1600;

export function validateUnitImage(file) {
  if (!file || !UNIT_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Vælg et JPG-, PNG- eller WebP-billede.");
  }
  if (file.size > UNIT_IMAGE_MAX_BYTES) {
    throw new Error("Billedet må højst fylde 10 MB.");
  }
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Billedet kunne ikke læses.")); };
    image.src = url;
  });
}

export async function prepareUnitImage(file) {
  validateUnitImage(file);
  const image = await loadImage(file);
  const scale = Math.min(1, UNIT_IMAGE_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  let blob = file;

  if (scale < 1) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Billedet kunne ikke tilpasses i denne browser.");
    context.drawImage(image, 0, 0, width, height);
    blob = await new Promise((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("Billedet kunne ikke gemmes.")),
      file.type === "image/png" ? "image/png" : "image/jpeg",
      0.86,
    ));
  }

  return {
    blob,
    type: blob.type || file.type,
    name: file.name,
    width,
    height,
    source: "user-upload",
    updatedAt: new Date().toISOString(),
  };
}
