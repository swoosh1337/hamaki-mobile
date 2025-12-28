/**
 * Centralized Logging System
 *
 * This utility provides a unified interface for logging across the application.
 * - In Development: Logs are printed to the console with beautiful formatting.
 * - In Production: Logs are sent to New Relic via the React Native SDK.
 *
 * Features:
 * - User context injection (userId, userName, email)
 * - Request correlation IDs for tracing
 * - New Relic integration for production
 * - Module-scoped child loggers
 */

import NewRelic from 'newrelic-react-native-agent';

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

/**
 * User context for logging - set from AuthContext
 */
export interface UserContext {
    userId: string;
    userName: string;
    email: string;
}

/**
 * New Relic configuration
 */
interface NewRelicConfig {
    enabled: boolean;
    appName: string;
}

// Global state for user context and New Relic
let globalUserContext: UserContext | null = null;
let newRelicConfig: NewRelicConfig | null = null;
let correlationId: string | null = null;

/**
 * Initialize New Relic for production logging
 * Call this once at app startup after NewRelic.startAgent()
 */
export function initNewRelic(config: NewRelicConfig): void {
    newRelicConfig = config;

    if (config.enabled) {
        console.log('New Relic logging integration initialized');
    }
}

/**
 * Set user context for all subsequent logs
 * Call this when user logs in
 */
export function setLogUserContext(context: UserContext | null): void {
    globalUserContext = context;

    // Also set New Relic user attributes for production
    if (!IS_DEV && newRelicConfig?.enabled && context) {
        try {
            NewRelic.setAttribute('userId', context.userId);
            NewRelic.setAttribute('userName', context.userName);
            NewRelic.setAttribute('userEmail', context.email);
        } catch {
            // Silently fail if New Relic not ready
        }
    }
}

/**
 * Get current user context (for external access)
 */
export function getLogUserContext(): UserContext | null {
    return globalUserContext;
}

/**
 * Set a correlation ID for request tracing
 * Useful for tracking a user action across multiple log entries
 */
export function setCorrelationId(id: string | null): void {
    correlationId = id;
}

/**
 * Generate a new correlation ID
 */
export function generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

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

        // 2. Build message with context
        const userPrefix = globalUserContext
            ? ` [User: ${globalUserContext.userId.substring(0, 8)}...]`
            : '';
        const corrPrefix = correlationId ? ` [${correlationId}]` : '';
        const messageWithPrefix = `${prefix}${userPrefix}${corrPrefix} ${message}`;

        // 3. Console Output - ALWAYS in dev, only WARN/ERROR in prod
        if (IS_DEV || level >= LogLevel.WARN) {
            const extraData = [];
            if (data) extraData.push(data);
            if (error) extraData.push(error);

            switch (level) {
                case LogLevel.DEBUG:
                    console.log(`🔍 DEBUG: ${messageWithPrefix}`, ...extraData);
                    break;
                case LogLevel.INFO:
                    console.log(`🔹 INFO:  ${messageWithPrefix}`, ...extraData);
                    break;
                case LogLevel.WARN:
                    console.warn(`⚠️ WARN:  ${messageWithPrefix}`, ...extraData);
                    break;
                case LogLevel.ERROR:
                    console.error(`❌ ERROR: ${messageWithPrefix}`, ...extraData);
                    break;
            }
        }

        // 4. Production - Send to New Relic
        if (!IS_DEV && newRelicConfig?.enabled && level >= LogLevel.INFO) {
            this.sendToNewRelic(level, message, module, data, error);
        }
    }

    /**
     * Send log to New Relic via SDK
     */
    private sendToNewRelic(
        level: LogLevel,
        message: string,
        module: string,
        data?: any,
        error?: Error
    ): void {
        try {
            // Build attributes for the log
            const attributes: Record<string, string | number | boolean> = {
                module,
                level: LogLevel[level],
            };

            // Add user context if available
            if (globalUserContext) {
                attributes.userId = globalUserContext.userId;
                attributes.userName = globalUserContext.userName;
                attributes.userEmail = globalUserContext.email;
            }

            // Add correlation ID if set
            if (correlationId) {
                attributes.correlationId = correlationId;
            }

            // Add data as JSON string if provided
            if (data) {
                try {
                    attributes.data = JSON.stringify(data);
                } catch {
                    attributes.data = String(data);
                }
            }

            // Add error details if provided
            if (error) {
                attributes.errorName = error.name;
                attributes.errorMessage = error.message;
                if ((error as any).code) {
                    attributes.errorCode = (error as any).code;
                }
            }

            // Record as breadcrumb for tracing
            NewRelic.recordBreadcrumb(`[${module}] ${message}`, attributes);

            // Use New Relic log methods based on level
            const logMessage = `[${module}] ${message}`;
            switch (level) {
                case LogLevel.INFO:
                    NewRelic.logInfo(logMessage);
                    break;
                case LogLevel.WARN:
                    NewRelic.logWarning(logMessage);
                    break;
                case LogLevel.ERROR:
                    NewRelic.logError(logMessage);
                    // Also record error for crash reporting if there's an error object
                    if (error) {
                        NewRelic.recordError(error);
                    }
                    break;
            }
        } catch {
            // Silently fail - don't log errors about logging
        }
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
        // Handle different error types properly
        let errorObj: Error;
        if (error instanceof Error) {
            errorObj = error;
        } else if (error && typeof error === 'object') {
            // Supabase errors and other objects with message property
            const errorMessage = error.message || error.error || JSON.stringify(error);
            errorObj = new Error(errorMessage);
            // Preserve additional properties for debugging
            if (error.code) (errorObj as any).code = error.code;
            if (error.details) (errorObj as any).details = error.details;
            if (error.hint) (errorObj as any).hint = error.hint;
        } else if (error) {
            errorObj = new Error(String(error));
        } else {
            errorObj = new Error('Unknown error');
        }
        this.log(LogLevel.ERROR, message, { error: errorObj, data });
    }

    /**
     * Create a child logger with a specific module name
     */
    child(moduleName: string): Logger {
        return new Logger(`${this.module}:${moduleName}`);
    }

    /**
     * Log with explicit user context (for cases where global context isn't set)
     * Useful for edge functions or background tasks
     */
    withUser(userId: string, userName?: string, email?: string) {
        const originalContext = globalUserContext;
        return {
            debug: (message: string, data?: any) => {
                globalUserContext = { userId, userName: userName || '', email: email || '' };
                this.debug(message, data);
                globalUserContext = originalContext;
            },
            info: (message: string, data?: any) => {
                globalUserContext = { userId, userName: userName || '', email: email || '' };
                this.info(message, data);
                globalUserContext = originalContext;
            },
            warn: (message: string, data?: any, error?: Error) => {
                globalUserContext = { userId, userName: userName || '', email: email || '' };
                this.warn(message, data, error);
                globalUserContext = originalContext;
            },
            error: (message: string, error?: any, data?: any) => {
                globalUserContext = { userId, userName: userName || '', email: email || '' };
                this.error(message, error, data);
                globalUserContext = originalContext;
            },
        };
    }

    /**
     * Log with correlation ID for request tracing
     */
    withCorrelation(id?: string) {
        const corrId = id || generateCorrelationId();
        const originalId = correlationId;
        return {
            id: corrId,
            debug: (message: string, data?: any) => {
                correlationId = corrId;
                this.debug(message, data);
                correlationId = originalId;
            },
            info: (message: string, data?: any) => {
                correlationId = corrId;
                this.info(message, data);
                correlationId = originalId;
            },
            warn: (message: string, data?: any, error?: Error) => {
                correlationId = corrId;
                this.warn(message, data, error);
                correlationId = originalId;
            },
            error: (message: string, error?: any, data?: any) => {
                correlationId = corrId;
                this.error(message, error, data);
                correlationId = originalId;
            },
        };
    }
}

// Export a default singleton instance for general use
export const logger = new Logger('Hamaki');

// Export function to create scoped loggers (e.g., const log = createLogger('Auth'))
export const createLogger = (moduleName: string) => logger.child(moduleName);
