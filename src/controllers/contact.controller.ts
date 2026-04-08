import { Request, Response } from 'express';
import { ContactService } from '../services/contact.service';

export class ContactController {
    static async getContacts(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const query = req.query;
            const result = await ContactService.getContacts(userId, query);
            res.json({ success: true, ...result });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    static async createContact(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const contact = await ContactService.createContact(userId, req.body);
            res.status(201).json({ success: true, contact });
        } catch (err: any) {
            res.status(400).json({ success: false, message: err.message });
        }
    }

    static async importContacts(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const { contacts } = req.body;
            if (!Array.isArray(contacts)) {
                return res.status(400).json({ success: false, message: 'Invalid contacts data' });
            }
            const result = await ContactService.importContacts(userId, contacts);
            res.json({ success: true, importedCount: result.length, contacts: result });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    static async deleteContact(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const contactId = req.params.id as string;
            await ContactService.deleteContact(userId, contactId);
            res.json({ success: true, message: 'Contact deleted' });
        } catch (err: any) {
            res.status(400).json({ success: false, message: err.message });
        }
    }

    static async batchDelete(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const { contactIds } = req.body;
            await ContactService.batchDelete(userId, contactIds);
            res.json({ success: true, message: 'Contacts deleted' });
        } catch (err: any) {
            res.status(400).json({ success: false, message: err.message });
        }
    }
}
