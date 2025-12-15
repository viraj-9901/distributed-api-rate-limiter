import Jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { config } from "../config/env";
import { Auth } from "../models/auth.model";
import { IAuth } from "../models/auth.model";
import { Request, Response, NextFunction } from "express";
import { JwtPayload } from "../types/jwt";

export const verifyToken = asyncHandler(async (req: Request, _: Response, next: NextFunction) => {
    try {
        const token = req.cookies?.accessToken || (req.headers.authorization as string)?.replace("Bearer ", "");
        if (!token) {
            throw new ApiError(401, "Unauthorized");
        }
        const decoded = Jwt.verify(token, config.ACCESS_TOKEN_SECRET) as JwtPayload;

        if (typeof decoded === 'string') {
            throw new ApiError(401, "Invalid token format");
        }

        const authUser: IAuth = await Auth.findById(decoded._id).select("-password") as IAuth;

        if (!authUser) {
            throw new ApiError(401, "Invalid Access Token");
        }

        req.authUser = authUser;
        next();
    } catch (error) {
        const message = error && typeof error === 'object' && 'message' in error
            ? (error as { message?: string }).message
            : undefined;

        throw new ApiError(401, message || "Invalid access token")
    }
})