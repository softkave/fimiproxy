import cluster from 'node:cluster';
import {FimiproxyLogLevel} from '../types.js';

const kLogLevelRank: Record<FimiproxyLogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export type LogFields = Record<string, unknown>;

let currentLevel: FimiproxyLogLevel = 'info';

export function configureLogger(level: FimiproxyLogLevel) {
  currentLevel = level;
}

function shouldLog(level: FimiproxyLogLevel) {
  return kLogLevelRank[level] <= kLogLevelRank[currentLevel];
}

function writeLine(stream: NodeJS.WriteStream, line: string) {
  // Non-blocking: ignore backpressure; dropping log lines under extreme load is
  // preferable to stalling the proxy event loop.
  stream.write(line);
}

function emit(level: FimiproxyLogLevel, msg: string, fields?: LogFields) {
  if (!shouldLog(level)) {
    return;
  }

  const record: LogFields = {
    level,
    msg,
    time: new Date().toISOString(),
    pid: process.pid,
    ...fields,
  };

  if (cluster.worker?.id !== undefined) {
    record.workerId = cluster.worker.id;
  }

  const line = `${JSON.stringify(record)}\n`;
  const stream = level === 'error' ? process.stderr : process.stdout;
  writeLine(stream, line);
}

export const logger = {
  error(msg: string, fields?: LogFields) {
    emit('error', msg, fields);
  },
  warn(msg: string, fields?: LogFields) {
    emit('warn', msg, fields);
  },
  info(msg: string, fields?: LogFields) {
    emit('info', msg, fields);
  },
  debug(msg: string, fields?: LogFields) {
    emit('debug', msg, fields);
  },
};

export function errorToLogFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }
  return {errorMessage: String(error)};
}
