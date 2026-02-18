// Logger System for Lirum All Image Converter
// Provides structured logging with levels, timestamps, and log viewer integration

const LOG_LEVELS = {
  DEBUG: { value: 0, label: 'DEBUG', color: '#7d8590' },
  INFO: { value: 1, label: 'INFO', color: '#2f81f7' },
  WARN: { value: 2, label: 'WARN', color: '#d29922' },
  ERROR: { value: 3, label: 'ERROR', color: '#f85149' },
  SUCCESS: { value: 4, label: 'SUCCESS', color: '#3fb950' }
};

const MAX_LOG_ENTRIES = 1000;

class Logger {
  constructor() {
    this.logs = [];
    this.logLevel = LOG_LEVELS.DEBUG;
    this.listeners = [];
    this.sessionStart = new Date().toISOString();
    this.isLogViewerOpen = false;
    
    // Add initial system info log
    this.info('Logger initialized', {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      sessionStart: this.sessionStart
    });
  }

  /**
   * Add a log entry
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {object} details - Additional details
   * @param {Error} error - Error object if applicable
   */
  log(level, message, details = null, error = null) {
    const timestamp = new Date();
    const entry = {
      id: this._generateId(),
      timestamp: timestamp.toISOString(),
      timestampLocal: timestamp.toLocaleString(),
      level: level.label,
      levelValue: level.value,
      levelColor: level.color,
      message: message,
      details: details,
      error: error ? this._serializeError(error) : null,
      stackTrace: error ? error.stack : null
    };

    // Store log (limit max entries)
    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.shift();
    }

    // Console output
    const consoleMethod = this._getConsoleMethod(level);
    if (error) {
      consoleMethod(`[${entry.level}] ${message}`, details || '', error);
    } else if (details) {
      consoleMethod(`[${entry.level}] ${message}`, details);
    } else {
      consoleMethod(`[${entry.level}] ${message}`);
    }

    // Notify listeners
    this._notifyListeners(entry);

    return entry;
  }

  debug(message, details) {
    return this.log(LOG_LEVELS.DEBUG, message, details);
  }

  info(message, details) {
    return this.log(LOG_LEVELS.INFO, message, details);
  }

  warn(message, details, error) {
    return this.log(LOG_LEVELS.WARN, message, details, error);
  }

  error(message, details, error) {
    return this.log(LOG_LEVELS.ERROR, message, details, error);
  }

  success(message, details) {
    return this.log(LOG_LEVELS.SUCCESS, message, details);
  }

  /**
   * Log an image conversion event
   */
  logConversion(sourceFormat, targetFormat, fileName, fileSize, dimensions, duration, success, error = null) {
    const details = {
      sourceFormat,
      targetFormat,
      fileName,
      fileSize,
      dimensions,
      duration: `${duration}ms`,
      success
    };

    if (success) {
      this.success(`Conversion completed: ${sourceFormat} -> ${targetFormat}`, details);
    } else {
      this.error(`Conversion failed: ${sourceFormat} -> ${targetFormat}`, details, error);
    }
  }

  /**
   * Log file load event
   */
  logFileLoad(fileName, fileType, fileSize, dimensions, decoder, success, error = null) {
    const details = {
      fileName,
      fileType,
      fileSize: fileSize ? `${(fileSize / 1024).toFixed(2)} KB` : 'unknown',
      dimensions,
      decoder,
      success
    };

    if (success) {
      this.info(`File loaded: ${fileName}`, details);
    } else {
      this.error(`File load failed: ${fileName}`, details, error);
    }
  }

  /**
   * Log decoder initialization
   */
  logDecoderInit(decoderName, success, error = null) {
    const details = { decoder: decoderName, success };
    
    if (success) {
      this.success(`${decoderName} decoder initialized`, details);
    } else {
      this.error(`${decoderName} decoder initialization failed`, details, error);
    }
  }

  /**
   * Get all logs
   */
  getLogs(filter = null) {
    if (!filter) return [...this.logs];
    
    return this.logs.filter(log => {
      if (filter.level && log.level !== filter.level) return false;
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const matchesMessage = log.message.toLowerCase().includes(searchLower);
        const matchesDetails = log.details && JSON.stringify(log.details).toLowerCase().includes(searchLower);
        if (!matchesMessage && !matchesDetails) return false;
      }
      if (filter.startTime && new Date(log.timestamp) < new Date(filter.startTime)) return false;
      if (filter.endTime && new Date(log.timestamp) > new Date(filter.endTime)) return false;
      return true;
    });
  }

  /**
   * Get logs as formatted text for export
   */
  getLogsAsText() {
    return this.logs.map(log => {
      let text = `[${log.timestamp}] [${log.level}] ${log.message}`;
      if (log.details) {
        text += `\n  Details: ${JSON.stringify(log.details, null, 2)}`;
      }
      if (log.error) {
        text += `\n  Error: ${log.error.message}`;
        if (log.stackTrace) {
          text += `\n  Stack: ${log.stackTrace}`;
        }
      }
      return text;
    }).join('\n\n');
  }

  /**
   * Get logs as JSON for export
   */
  getLogsAsJSON() {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Clear all logs
   */
  clear() {
    const count = this.logs.length;
    this.logs = [];
    this.info('Logs cleared', { previousCount: count });
    this._notifyListeners({ type: 'cleared', count });
  }

  /**
   * Get log statistics
   */
  getStats() {
    const stats = {
      total: this.logs.length,
      byLevel: {},
      sessionStart: this.sessionStart,
      duration: Date.now() - new Date(this.sessionStart).getTime()
    };

    Object.keys(LOG_LEVELS).forEach(level => {
      stats.byLevel[level] = this.logs.filter(log => log.level === level).length;
    });

    return stats;
  }

  /**
   * Subscribe to log updates
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  _notifyListeners(entry) {
    this.listeners.forEach(cb => {
      try {
        cb(entry);
      } catch (err) {
        console.error('Log listener error:', err);
      }
    });
  }

  _generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  _serializeError(error) {
    if (!error) return null;
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack
    };
  }

  _getConsoleMethod(level) {
    switch (level) {
      case LOG_LEVELS.ERROR: return console.error;
      case LOG_LEVELS.WARN: return console.warn;
      case LOG_LEVELS.SUCCESS: return console.info;
      case LOG_LEVELS.INFO: return console.info;
      case LOG_LEVELS.DEBUG: return console.debug;
      default: return console.log;
    }
  }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;
module.exports.LOG_LEVELS = LOG_LEVELS;
