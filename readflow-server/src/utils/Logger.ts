const getTimestamp = () => new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

class Logger {
  private logs: string[] = [];
  private readonly MAX_LOGS = 500;

  private addLog(level: string, ...args: any[]) {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    const logLine = `${getTimestamp()} [${level}] ${msg}`;
    
    // Console output
    if (level === 'ERROR') console.error(logLine);
    else if (level === 'WARN') console.warn(logLine);
    else console.log(logLine);

    // Buffer
    this.logs.unshift(logLine);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.pop();
    }
  }

  info(...args: any[]) { this.addLog('INFO', ...args); }
  warn(...args: any[]) { this.addLog('WARN', ...args); }
  error(...args: any[]) { this.addLog('ERROR', ...args); }

  getLogs(limit = 100) {
    return this.logs.slice(0, limit);
  }
}

export const logger = new Logger();
