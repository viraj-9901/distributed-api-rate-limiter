import { JwtPayload as BaseJwtPayload } from "jsonwebtoken";
import { IAuth } from "../models/auth.model"

export interface JwtPayload extends BaseJwtPayload {
    _id: string;
    email: string;
    referenceNumber: string;
}

