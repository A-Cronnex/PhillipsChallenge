/**
 * Log levels in decreasing order of severity
 */
export type LogLevel = "error" | "warn" | "info" | "debug" | "verbose";
interface LogEvent {
    level: LogLevel;
    tag: string;
    message: string;
}
/**
 * Handler for `onLog` events
 *
 * Called before logging a message, return false to proceed with default
 * logging.
 *
 * @param event -
 */
type LogHandler = (event: LogEvent) => boolean;
declare class LogManager {
    private logLevel;
    private startedCount;
    private logHandler;
    private subscription;
    constructor();
    /**
     * Override logging behavior
     *
     * @param logHandler -
     */
    onLog(logHandler: LogHandler): void;
    /**
     * Set the minimum log level for a message to be logged
     *
     * @param level - Minimum log level
     */
    setLogLevel(level: LogLevel): void;
    start(): void;
    stop(): void;
    private subscribe;
    private unsubscribe;
    private effectiveLevel;
    private handleLog;
}
declare const logManager: LogManager;
export { logManager as LogManager };
//# sourceMappingURL=LogManager.d.ts.map