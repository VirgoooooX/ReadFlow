const getTimestamp = () => new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

const COLORS = {
  RESET: '\x1b[0m',
  BRIGHT: '\x1b[1m',
  DIM: '\x1b[2m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
  GRAY: '\x1b[90m',
};

class Logger {
  private logs: string[] = [];
  private readonly MAX_LOGS = 1000; // Increased buffer size

  private formatMessage(level: string, category: string, ...args: any[]): { raw: string, colored: string } {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    const timestamp = getTimestamp();
    
    let levelColor = COLORS.WHITE;
    let catColor = COLORS.BLUE;

    switch (level) {
      case 'ERROR': levelColor = COLORS.RED; break;
      case 'WARN': levelColor = COLORS.YELLOW; break;
      case 'INFO': levelColor = COLORS.GREEN; break;
    }

    switch (category) {
      case 'SYS': catColor = COLORS.CYAN; break;
      case 'API': catColor = COLORS.BLUE; break;
      case 'APP': catColor = COLORS.GREEN; break;
    }

    const raw = `${timestamp} [${level}] [${category}] ${msg}`;
    const colored = `${COLORS.DIM}${timestamp}${COLORS.RESET} ${levelColor}[${level}]${COLORS.RESET} ${catColor}[${category}]${COLORS.RESET} ${msg}`;

    return { raw, colored };
  }

  private addLog(level: string, category: string, ...args: any[]) {
    const { raw, colored } = this.formatMessage(level, category, ...args);
    
    // Console output (colored)
    if (level === 'ERROR') console.error(colored);
    else if (level === 'WARN') console.warn(colored);
    else console.log(colored);

    // Buffer (raw text for API/storage)
    this.logs.unshift(raw);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.pop();
    }
  }

  info(...args: any[]) { this.addLog('INFO', 'APP', ...args); }
  warn(...args: any[]) { this.addLog('WARN', 'APP', ...args); }
  error(...args: any[]) { this.addLog('ERROR', 'APP', ...args); }
  
  // Specialized loggers
  request(...args: any[]) { this.addLog('INFO', 'API', ...args); }
  system(...args: any[]) { this.addLog('INFO', 'SYS', ...args); }

  getLogs(limit = 100) {
    return this.logs.slice(0, limit);
  }
}

export const logger = new Logger();
