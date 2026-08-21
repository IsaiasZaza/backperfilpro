import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { env } from "../config/env";
import { badRequest } from "./errors";

export const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);

fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

/**
 * Em dev os avatares ficam em disco e sao servidos por /uploads.
 * Em producao, troque este storage por S3/Cloudinary (a rota nao muda).
 */
export const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: env.MAX_AVATAR_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      cb(badRequest("Envie uma imagem JPEG, PNG ou WEBP", "INVALID_FILE_TYPE"));
      return;
    }
    cb(null, true);
  },
}).single("file");

export const buildAvatarUrl = (filename: string) => `${env.APP_URL}/uploads/${filename}`;
