interface ErrorDetail {
    field?: string;
    message: string;
}

class ApiError extends Error {
    public statusCode: number;
    public override message: string;
    public errors: ErrorDetail[];
    public success: boolean;
    public data: null;

    constructor(
        statusCode: number,
        message: string = "Something went wrong",
        errors: ErrorDetail[] = [],
        stack: string = ""
    ) {
        super(message);
        this.statusCode = statusCode;
        this.message = message;
        this.errors = errors;
        this.success = false;
        this.data = null;

        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

export { ApiError };