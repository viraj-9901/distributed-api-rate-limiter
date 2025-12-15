import IAuth from "../../models/auth.model"

declare global {
    namespace Express {
        interface Request {
            authUser?: IAuth;
        }
    }
}

export { };