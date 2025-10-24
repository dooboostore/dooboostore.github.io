import { Logger, LoggerLevel } from '@dooboostore/core/logger/Logger';
import { environment } from '@front-end/environments/environment';


export const frontLogger = new Logger(environment.loggerConfig);
