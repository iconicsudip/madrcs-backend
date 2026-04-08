import { IRcsService } from './rcs.interface';
import { Msg91RcsService } from './msg91.service';

export class RcsServiceFactory {
  private static instance: IRcsService;

  static getInstance(): IRcsService {
    if (!this.instance) {
      // Currently only MSG91 is supported
      this.instance = new Msg91RcsService();
      console.log(`[RCS Framework] Initialized with default MSG91 provider.`);
    }
    
    return this.instance;
  }
}

// Export a singleton instance we can use everywhere
export const rcsService = RcsServiceFactory.getInstance();

// Export the types and enums so other files can use them easily
export * from './rcs.interface';
export * from '../../enums/rcs.enum';
