/**
 * Centralized Logging System
 * 
 * This utility provides a unified interface for logging across the application.
 * - In Development: Logs are printed to the console with beautiful formatting.
 * - In Production: Debug logs are stripped, and critical logs (warn/error) can be 
 *   sent to an external service (e.g., Sentry, Datadog).
 */

declare const __DEV__: boolean;

// Log levels
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

// Check environment
const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

interface LogOptions {
    module?: string;
    data?: any;
    error?: Error;
}

class Logger {
    private module: string;

    constructor(module: string = 'App') {
        this.module = module;
    }

    /**
     * Internal log handler
     */
    private log(level: LogLevel, message: string, options?: LogOptions) {
        // 1. Skip debug logs in production
        if (level === LogLevel.DEBUG && !IS_DEV) {
            return;
        }

        const { module = this.module, data, error } = options || {};
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${module}]`;

        // 2. Local Console Output (Always enabled in Dev, only for Warn/Error in Prod)
        if (IS_DEV || level >= LogLevel.WARN) {
            const messageWithPrefix = `${prefix} ${message}`;
            const extraData = [];
            if (data) extraData.push(data);
            if (error) extraData.push(error);

            const messagePart = messageWithPrefix;
            const dataParts = extraData;

            switch (level) {
                case LogLevel.DEBUG:
                    console.log(`🔍 DEBUG: ${messagePart}`, ...dataParts);
                    break;
                case LogLevel.INFO:
                    console.log(`🔹 INFO:  ${messagePart}`, ...dataParts);
                    break;
                case LogLevel.WARN:
                    console.warn(`⚠️ WARN:  ${messagePart}`, ...dataParts);
                    break;
                case LogLevel.ERROR:
                    console.error(`❌ ERROR: ${messagePart}`, ...dataParts);
                    break;
            }
        }

        // 3. Production Service Hook (Placeholder for Sentry/Datadog/etc)
        if (!IS_DEV && level >= LogLevel.INFO) {
            this.sendToProductionService(level, message, { module, data, error });
        }
    }

    /**
     * Placeholder for future production logging integration
     */
    private sendToProductionService(level: LogLevel, message: string, context: any) {
        // TODO: Hook up Sentry.captureMessage or similar here
        // For now, this is a no-op in production unless it's a critical error
    }

    // Public API
    debug(message: string, data?: any) {
        this.log(LogLevel.DEBUG, message, { data });
    }

    info(message: string, data?: any) {
        this.log(LogLevel.INFO, message, { data });
    }

    warn(message: string, data?: any, error?: Error) {
        this.log(LogLevel.WARN, message, { data, error });
    }

    error(message: string, error?: any, data?: any) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        this.log(LogLevel.ERROR, message, { error: errorObj, data });
    }

    /**
     * Create a child logger with a specific module name
     */
    child(moduleName: string): Logger {
        return new Logger(`${this.module}:${moduleName}`);
    }
}

// Export a default singleton instance for general use
export const logger = new Logger('Hamaki');

// Export function to create scoped loggers (e.g., const log = createLogger('Auth'))
export const createLogger = (moduleName: string) => logger.child(moduleName);
