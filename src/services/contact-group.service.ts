import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class ContactGroupService {
    static async getGroups(userId: string) {
        return prisma.contactGroup.findMany({
            where: { user_id: userId },
            include: {
                _count: {
                    select: { contacts: true }
                }
            },
            orderBy: { created_at: 'desc' }
        });
    }

    static async createGroup(userId: string, data: any) {
        const { name, description } = data;
        return prisma.contactGroup.create({
            data: {
                name,
                description,
                user_id: userId
            }
        });
    }

    static async updateGroup(userId: string, groupId: string, data: any) {
        return prisma.contactGroup.update({
            where: { id: groupId, user_id: userId },
            data: {
                name: data.name,
                description: data.description
            }
        });
    }

    static async deleteGroup(userId: string, groupId: string) {
        return prisma.contactGroup.delete({
            where: { id: groupId, user_id: userId }
        });
    }

    static async addContactsToGroup(userId: string, groupId: string, contactIds: string[]) {
        return prisma.contactGroup.update({
            where: { id: groupId, user_id: userId },
            data: {
                contacts: {
                    connect: contactIds.map(id => ({ id }))
                }
            }
        });
    }

    static async removeContactsFromGroup(userId: string, groupId: string, contactIds: string[]) {
        return prisma.contactGroup.update({
            where: { id: groupId, user_id: userId },
            data: {
                contacts: {
                    disconnect: contactIds.map(id => ({ id }))
                }
            }
        });
    }
}
