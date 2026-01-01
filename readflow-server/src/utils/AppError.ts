export class AppError extends Error {
  code: string;
  details?: any;
  timestamp: Date;

  constructor(data: {
    code: string;
    message: string;
    details?: any;
    timestamp: Date;
  }) {
    super(data.message);
    this.code = data.code;
    this.details = data.details;
    this.timestamp = data.timestamp;
    this.name = 'AppError';
  }
}
