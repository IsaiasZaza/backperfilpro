import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import sharp from "sharp";
import { env } from "../config/env";
import { badRequest } from "./errors";

export const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);

fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export const AVATAR_MAX_BYTES = env.MAX_AVATAR_SIZE_MB * 1024 * 1024;

function hasAllowedMagicBytes(buffer: Buffer) {
  if (buffer.length < 12) return false;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return true;
  }
  return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
}

/**
 * Recebe o arquivo em memoria. O nome original e ignorado:
 * o objeto no Storage e sempre `{userId}.webp`.
 */
export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!ALLOWED_MIME.has(file.mimetype) || (ext && !ALLOWED_EXT.has(ext))) {
      cb(badRequest("Envie uma imagem JPEG, PNG ou WEBP", "INVALID_FILE_TYPE"));
      return;
    }
    cb(null, true);
  },
}).single("file");

async function processImage(buffer: Buffer, width: number, height: number) {
  if (!hasAllowedMagicBytes(buffer)) {
    throw badRequest("Envie uma imagem JPEG, PNG ou WEBP", "INVALID_FILE_TYPE");
  }

  try {
    return await sharp(buffer, { failOn: "error" })
      .rotate()
      .resize(width, height, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw badRequest("Arquivo de imagem invalido", "INVALID_FILE_TYPE");
  }
}

/** Converte para WEBP 256x256. Nao confia no MIME informado pelo cliente. */
export async function processAvatarImage(buffer: Buffer) {
  return processImage(buffer, 256, 256);
}

/** Capa/banner em 16:9. Mesma validacao e formato do avatar. */
export async function processBannerImage(buffer: Buffer) {
  return processImage(buffer, 1600, 900);
}

/** Remove avatar antigo gravado em disco pela implementacao anterior (`/uploads`). */
export function removeLocalAvatarIfOwned(avatarUrl: string | null | undefined) {
  if (!avatarUrl) return;

  let filename: string;
  try {
    const parsed = new URL(avatarUrl);
    if (!parsed.pathname.includes("/uploads/")) return;
    filename = path.basename(parsed.pathname);
  } catch {
    return;
  }

  if (!filename || filename.includes("..")) return;

  const fullPath = path.resolve(uploadDir, filename);
  const relative = path.relative(uploadDir, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return;

  fs.unlink(fullPath, () => undefined);
}
