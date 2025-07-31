import { createLogger, format, transports } from "winston";
import path from "path";
import fs from "fs";

// 确保 logs 文件夹存在
const logDir = path.resolve(__dirname, "..", "..", "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

export const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}] ${message}`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: path.join(logDir, "pay.log") })
  ]
});

export const log = (message: string) => logger.info(message);
