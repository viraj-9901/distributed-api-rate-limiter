class ApiResponse {
    public statusCode: number;
    public data: {};
    public message: string;

    constructor(
        statusCode: number,
        data: {},
        message: string
    ) {
        this.statusCode = statusCode;
        this.data = data;
        this.message = message;
    }
}

export { ApiResponse };