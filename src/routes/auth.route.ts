import { Router } from "express";
import {
    register,
    login,
    logout,
    forgotPassword,
    resetPassword,
    refreshToken
} from "../controllers/auth.controller";
import { verifyToken } from "../middlewares/auth.middleware";


const router = Router();

router.route("/register").post(register);
router.route("/login").post(login);
router.route("/forgot-password").post(forgotPassword);
router.route("/reset-password").post(resetPassword);
router.route("/logout").post(verifyToken, logout);
router.route("/refresh-token").post(verifyToken, refreshToken);

export default router;
