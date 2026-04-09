import { PrismaClient } from '@prisma/client';
import { formatPhoneNumber } from '../utils/phone.util';

const prisma = new PrismaClient();

export class ContactService {
    static async getContacts(userId: string, query: any) {
        let { search, group, status, page = 1, limit = 10 } = query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: any = { user_id: userId };

        // Clean up queries that might come as "null" or "undefined" strings
        if (search === 'null' || search === 'undefined') search = '';
        if (group === 'null' || group === 'undefined') group = '';
        if (status === 'null' || status === 'undefined') status = '';

        if (search && search.trim() !== '') {
            const cleanSearch = search.trim();
            const searchTerms: any[] = [
                { name: { contains: cleanSearch, mode: 'insensitive' } },
                { phone_number: { contains: cleanSearch, mode: 'insensitive' } }
            ];
            
            // Also search by formatted phone if search looks like numbers (at least 3 digits to avoid +91 over-matching)
            if (/^\d{3,}$/.test(cleanSearch)) {
                const formattedSearch = formatPhoneNumber(cleanSearch);
                searchTerms.push({ phone_number: { contains: formattedSearch, mode: 'insensitive' } });
            }

            where.OR = searchTerms;
        }

        if (group && group !== '') {
            where.groups = { some: { id: group } };
        }

        if (status && status !== '') {
            where.status = status;
        }

        const [contacts, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                include: { groups: true },
                skip,
                take: Number(limit),
                orderBy: { created_at: 'desc' }
            }),
            prisma.contact.count({ where })
        ]);

        return { contacts, total, page: Number(page), limit: Number(limit) };
    }

    static async createContact(userId: string, data: any) {
        const { name, phone_number, groupIds = [] } = data;
        const formattedPhone = formatPhoneNumber(phone_number);
        
        return prisma.contact.create({
            data: {
                name,
                phone_number: formattedPhone,
                user_id: userId,
                groups: {
                    connect: groupIds.map((id: string) => ({ id }))
                }
            },
            include: { groups: true }
        });
    }

    static async importContacts(userId: string, contactsData: any[]) {
        const results: any[] = [];
        for (const contact of contactsData) {
            try {
                const formattedPhone = formatPhoneNumber(contact.phone_number);
                
                const created = await prisma.contact.upsert({
                    where: {
                        phone_number_user_id: {
                            phone_number: formattedPhone,
                            user_id: userId
                        }
                    },
                    update: { name: contact.name },
                    create: {
                        name: contact.name,
                        phone_number: formattedPhone,
                        user_id: userId
                    }
                });
                results.push(created);
            } catch (err) {
                console.error(`Failed to import contact ${contact.phone_number}:`, err);
            }
        }
        return results;
    }

    static async deleteContact(userId: string, contactId: string) {
        return prisma.contact.delete({
            where: { id: contactId, user_id: userId }
        });
    }

    static async batchDelete(userId: string, contactIds: string[]) {
        return prisma.contact.deleteMany({
            where: {
                id: { in: contactIds },
                user_id: userId
            }
        });
    }
}
