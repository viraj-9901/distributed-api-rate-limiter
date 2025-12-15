import dotenv from "dotenv";
dotenv.config();

export const dbConfig = {
    MONGODB_URI: process.env.MONGODB_URI,
    DB_NAME: process.env.DB_NAME
}
