import { Request, Response } from 'express';
import { ContactGroupService } from '../services/contact-group.service';

export class ContactGroupController {
    static async getGroups(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const groups = await ContactGroupService.getGroups(userId);
            res.json({ success: true, groups });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    static async createGroup(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const group = await ContactGroupService.createGroup(userId, req.body);
            res.status(201).json({ success: true, group });
        } catch (err: any) {
            res.status(400).json({ success: false, message: err.message });
        }
    }

    static async updateGroup(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const groupId = req.params.id as string;
            const group = await ContactGroupService.updateGroup(userId, groupId, req.body);
            res.json({ success: true, group });
        } catch (err: any) {
            res.status(400).json({ success: false, message: err.message });
        }
    }

    static async deleteGroup(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const groupId = req.params.id as string;
            await ContactGroupService.deleteGroup(userId, groupId);
            res.json({ success: true, message: 'Group deleted' });
        } catch (err: any) {
            res.status(400).json({ success: false, message: err.message });
        }
    }

    static async addContactsToGroup(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const groupId = req.params.id as string;
            const { contactIds } = req.body;
            await ContactGroupService.addContactsToGroup(userId, groupId, contactIds);
            res.json({ success: true, message: 'Contacts added to group' });
        } catch (err: any) {
            res.status(400).json({ success: false, message: err.message });
        }
    }

    static async removeContactsFromGroup(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const groupId = req.params.id as string;
            const { contactIds } = req.body;
            await ContactGroupService.removeContactsFromGroup(userId, groupId, contactIds);
            res.json({ success: true, message: 'Contacts removed from group' });
        } catch (err: any) {
            res.status(400).json({ success: false, message: err.message });
        }
    }
}
