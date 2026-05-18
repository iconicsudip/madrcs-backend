import { IRcsService } from './rcs.interface';
import { Msg91RcsService } from './msg91.service';
import { JiocxRcsService } from './jiocx.service';
import { RcsProvider } from '../../enums/rcs.enum';

export class RcsServiceFactory {
  static getService(provider: string | RcsProvider): IRcsService {
    if (provider === RcsProvider.JIOCX) {
      return new JiocxRcsService();
    }
    return new Msg91RcsService();
  }
}

// Keep a default one around for generic use cases where provider isn't strictly known, or just use the factory directly
export const rcsService = RcsServiceFactory.getService(RcsProvider.MSG91);

export * from './rcs.interface';
export * from '../../enums/rcs.enum';
export * from './jiocx.service';
