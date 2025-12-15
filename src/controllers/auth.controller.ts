import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import Jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { RefreshTokens } from "../models/refresh_tokens";
import { Auth } from "../models/auth.model";
import { Organization } from "../models/organization.model";
import { config } from "../config/env";
import { Request, Response } from "express";
import { JwtPayload } from "../types/jwt";
import { Types } from "mongoose";

const generateAccessAndRefreshToken = async (userId: Types.ObjectId) => {
    try {
        const authUser = await Auth.findById(userId);
        const accessToken = authUser?.generateAccessToken();
        const refreshToken = authUser?.generateRefreshToken();

        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(500, 'Something went wrong while generating access and refresh token')
    }
}

const register = asyncHandler(async (req: Request, res: Response) => {
    try {
        const { email, password, organizationName } = req.body;

        if (!email || !password || [email, password].some((field) => field?.trim() === "")) {
            throw new ApiError(400, "Invalid email or password");
        }

        const existingUser = await Auth.findOne({ email });

        if (existingUser) {
            throw new ApiError(400, "User already exists");
        }

        const authUser = await Auth.create({
            email,
            password,
            referenceNumber: uuidv4()
        });

        let randomBytes = crypto.getRandomValues(new Uint8Array(8));
        let organizationKey = Buffer.from(randomBytes).toString('hex');

        await Organization.create(
            {
                authUserId: authUser._id,
                orgKey: `org_${organizationKey}`,
                organizationName: organizationName
            }
        );

        return res.status(201).json(
            new ApiResponse(201, { authUser }, "User registered successfully")
        )
    } catch (error) {
        throw error;
    }
})

const login = asyncHandler(async (req: Request, res: Response) => {
    const { loginIdentifier, password } = req.body;

    if (!loginIdentifier || !password) {
        throw new ApiError(400, "Invalid login identifier or password");
    }

    const authUser = await Auth.findOne({
        $or: [
            { email: loginIdentifier },
            { referenceNumber: loginIdentifier }
        ]
    });

    if (!authUser) {
        throw new ApiError(400, "Invalid login identifier");
    }

    if (authUser.lockUntil && authUser.lockUntil > new Date(Date.now())) {
        throw new ApiError(400, "User is locked, Try after few minutes");
    }

    const isPasswordValid = await authUser.comparePassword(password);

    if (!isPasswordValid) {

        if (authUser.loginAttempts > 3) {
            //Lock user for 15 minutes
            authUser.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
            throw new ApiError(400, "User is locked, Try after 15 minutes");
        } else {
            authUser.loginAttempts++;
            await authUser.save();
            throw new ApiError(400, "Invalid password");
        }
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(authUser._id);

    const loggedInUser = await Auth.findById(authUser._id).select("-password");

    const decodedRefreshToken = refreshToken && Jwt.decode(refreshToken);
    const expiredAt = decodedRefreshToken && typeof decodedRefreshToken === 'object' && decodedRefreshToken.exp && new Date(decodedRefreshToken.exp * 1000);

    await RefreshTokens.findOneAndUpdate(
        { authUserId: authUser._id },
        {
            refreshToken: refreshToken,
            expiredAt: expiredAt,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        },
        { upsert: true, new: true }
    );

    const option = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
        .cookie("accessToken", accessToken, option)
        .cookie("refreshToken", refreshToken, option)
        .json(
            new ApiResponse(200, { user: loggedInUser, accessToken, refreshToken }, "User logged in successfully"))
})

const logout = asyncHandler(async (req: Request, res: Response) => {
    // await Auth.findByIdAndUpdate(
    //     req.authUser?._id,
    //     {
    //         status: "inactive",
    //         loginAttempts: 0
    //     }
    // );

    // await RefreshTokens.findOneAndDelete({
    //     authUserId: req.authUser?._id
    // });

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged out"))
})

const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email) {
        throw new ApiError(400, "Email is required")
    }

    const authUser = await Auth.findOne({ email });

    if (!authUser) {
        throw new ApiError(400, "Invalid email")
    }

    // const resetToken = crypto.randomInt(100000, 999999);
    const resetToken = crypto.randomUUID();
    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

    await Auth.findOneAndUpdate(
        { email },
        { resetToken, resetTokenExpiry },
        { new: true }
    );

})

const resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const { email, resetToken, password } = req.body;

    if (!email || !resetToken || !password) {
        throw new ApiError(400, "Email, reset token and password are required")
    }

    const authUser = await Auth.findOne({ email });

    if (!authUser) {
        throw new ApiError(400, "Invalid email")
    }

    if (authUser.resetToken !== resetToken) {
        throw new ApiError(400, "Invalid reset token")
    }

    if (authUser?.resetTokenExpiry && authUser?.resetTokenExpiry < new Date(Date.now())) {
        throw new ApiError(400, "Reset token expired")
    }

    authUser.password = password;
    authUser.resetToken = undefined;
    authUser.resetTokenExpiry = undefined;

    await authUser.save();

    return res.status(200).json(new ApiResponse(200, {}, "Password reset successfully"))
})

const refreshToken = asyncHandler(async (req: Request, res: Response) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(400, "Unauthorized request")
    }

    const decodedRefreshToken = Jwt.verify(incomingRefreshToken, config.REFRESH_TOKEN_SECRET) as JwtPayload;

    const authUser = await Auth.findById(decodedRefreshToken._id);

    if (!authUser) {
        throw new ApiError(400, "Invalid refresh token")
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(authUser._id);

    const expiredAt = decodedRefreshToken?.exp ? new Date(decodedRefreshToken.exp * 1000) : undefined;

    await RefreshTokens.findOneAndUpdate(
        { authUserId: authUser._id },
        {
            refreshToken: refreshToken,
            expiredAt: expiredAt,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        },
        { upsert: true, new: true }
    );

    const option = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
        .cookie("accessToken", accessToken, option)
        .cookie("refreshToken", refreshToken, option)
        .json(new ApiResponse(200, { accessToken, refreshToken }, "Access Token Refreshed Successfully"))
})

export {
    register,
    login,
    logout,
    forgotPassword,
    resetPassword,
    refreshToken
}