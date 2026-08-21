import type { NextFunction, Request, Response } from "express";
import type { Profile } from "../db/types";
import { getProfileByUserId } from "../modules/profile/profile.service";

declare global {
  namespace Express {
    interface Request {
      /** Perfil do usuario logado, carregado pelo middleware `loadProfile`. */
      profile?: Profile;
    }
  }
}

/**
 * Roda depois do `authenticate` em todas as rotas /me/profile/*.
 * Como tudo passa a usar `req.profile.id`, um usuario nunca alcanca dados de outro.
 */
export async function loadProfile(req: Request, _res: Response, next: NextFunction) {
  req.profile = await getProfileByUserId(req.user!.id);
  next();
}
