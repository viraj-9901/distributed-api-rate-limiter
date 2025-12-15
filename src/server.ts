import { app } from "./app";
import connectDB from "./db/index";
import { config } from "./config/env";

const PORT = config.PORT || 8000;

connectDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        })
    })
    .catch((error: Error) => {
        console.log('Uncaught Exception:', error.message);
        process.exit(1);
    })