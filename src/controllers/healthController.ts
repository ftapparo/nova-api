// src/controllers/healthController.ts
import { Request, Response } from "express";

export const healthCheck = (_req: Request, res: Response) => {
    const ambiente = process.env.NODE_ENV || "desenvolvimento";
    res.status(200).json({
        content: `API em funcionamento - ambiente: ${ambiente}`,
        success: true,
        messageError: null,
        errors: null,
    });
};
