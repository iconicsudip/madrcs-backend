import { IRcsService } from './rcs.interface';
import { Msg91RcsService } from './msg91.service';
import { GoogleRcsService } from './google.service';
import { RcsProvider } from '../../enums/rcs.enum';

export class RcsServiceFactory {
  static getService(provider: string | RcsProvider): IRcsService {
    if (provider === RcsProvider.GOOGLE) {
      return new GoogleRcsService();
    }
    return new Msg91RcsService();
  }
}

// Keep a default one around for generic use cases where provider isn't strictly known, or just use the factory directly
export const rcsService = RcsServiceFactory.getService(RcsProvider.MSG91);

export * from './rcs.interface';
export * from '../../enums/rcs.enum';

