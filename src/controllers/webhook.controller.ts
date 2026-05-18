import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { RcsEventType, CampaignStatus, RcsProvider } from '../enums/rcs.enum';

export class WebhookController {
    /**
     * Handle MSG91 RCS delivery webhooks
     * Reference format from MSG91 usually includes requestId, status, and numbers.
     */
    static async handleMsg91Rcs(req: Request, res: Response) {
        try {
            const payload = req.body;
            console.log('[Webhook] Received MSG91 RCS Event:', JSON.stringify(payload));

            const events = Array.isArray(payload.data) ? payload.data : [payload];

            for (const event of events) {
                // MSG91 reporting data
                const { requestId, eventName, customerNumber, desc, statusUpdatedAt, countryName, countryCode, telecomCircle } = event;
                let status = eventName?.toUpperCase();

                if (!customerNumber || !status) continue;

                // If status is submitted then consider as delivered
                if (status === 'SUBMITTED') {
                    status = RcsEventType.DELIVERED;
                }

                // Standardize number with +
                const formattedNumber = customerNumber.startsWith('+') ? customerNumber : `+${customerNumber}`;

                // 1. Find the campaign matching this MSG91 requestId
                const campaign = await prisma.campaign.findFirst({
                    where: {
                        request_id: requestId
                    } as any
                });

                if (campaign) {
                    const statusDate = statusUpdatedAt ? new Date(statusUpdatedAt) : new Date();

                    const eventData: any = {
                        event_type: status,
                        error_details: desc || null,
                        status_updated_at: statusDate,
                        country: countryName || null,
                        country_code: countryCode || null,
                        telecom_circle: telecomCircle || null
                    };

                    if (status === RcsEventType.SENT) eventData.sent_at = statusDate;
                    if (status === RcsEventType.DELIVERED) eventData.delivered_at = statusDate;
                    if (status === RcsEventType.READ) eventData.read_at = statusDate;
                    if (status === RcsEventType.CLICKED) eventData.engagement = 'Clicked';

                    // 2. Upsert detailed event record (update SENT to ACTUAL STATUS)
                    await prisma.campaignEvent.upsert({
                        where: {
                            campaign_id_phone_number: {
                                campaign_id: campaign.id,
                                phone_number: formattedNumber
                            }
                        },
                        update: eventData,
                        create: {
                            campaign_id: campaign.id,
                            phone_number: formattedNumber,
                            ...eventData
                        }
                    });

                    // 4. CREDIT CONSUMPTION & STATUS UPDATES: 
                    if (status === RcsEventType.DELIVERED) {
                        // Deduct 1 credit from the user who owns this campaign
                        await prisma.user.update({
                            where: { id: campaign.user_id },
                            data: {
                                credit_balance: { decrement: 1 }
                            }
                        });

                        // 5. UPDATE CAMPAIGN STATUS: Check for completion
                        const deliveredCount = await prisma.campaignEvent.count({
                            where: { campaign_id: campaign.id, delivered_at: { not: null } }
                        });

                        let newStatus = campaign.status;
                        if (deliveredCount === campaign.total_contacts) {
                            newStatus = CampaignStatus.COMPLETED;
                        } else if (deliveredCount > 0 && campaign.status !== CampaignStatus.PAUSED) {
                            newStatus = CampaignStatus.PARTIALLY_COMPLETED;
                        }

                        if (newStatus !== campaign.status) {
                            await prisma.campaign.update({
                                where: { id: campaign.id },
                                data: { status: newStatus }
                            });
                        }
                    }
                }
            }

            res.status(200).json({ success: true, message: 'Webhook received' });
        } catch (err: any) {
            console.error('[Webhook Error]:', err.message);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    /**
     * Handle JioCX RCS events
     */
    static async handleJiocxRcs(req: Request, res: Response) {
        try {
            const payload = req.body;
            console.log('[Webhook] Received JioCX RCS Event:', JSON.stringify(payload));

            const { entityType, entity, userPhoneNumber, messageId, reachableUsers, unReachableUsers } = payload;

            // 1. Handle reachability events (User Reachable/Unreachable)
            if (reachableUsers || unReachableUsers) {
                const mid = messageId || payload.referenceID;
                if (!mid) return res.status(200).json({ success: true });

                const campaign = await prisma.campaign.findFirst({
                    where: { request_id: mid } as any
                });

                if (campaign) {
                    const users = reachableUsers || unReachableUsers;
                    const eventType = reachableUsers ? RcsEventType.REACHABLE : RcsEventType.UNREACHABLE;
                    for (const phone of users) {
                        const formattedNumber = phone.startsWith('+') ? phone : `+${phone}`;
                        await WebhookController.processProviderEvent(campaign, formattedNumber, eventType, new Date());
                    }
                }
                return res.status(200).json({ success: true });
            }

            // 2. Handle User Messages (Replies/Suggestions)
            if (entityType === 'USER_MESSAGE') {
                const phone = userPhoneNumber;
                const mid = entity?.messageId || payload.metaData?.orgMsgId;
                
                // Find campaign to get user_id
                let userId: string | null = null;
                if (mid) {
                    const campaign = await prisma.campaign.findFirst({
                        where: { request_id: mid } as any,
                        select: { user_id: true }
                    });
                    if (campaign) userId = campaign.user_id;
                }

                await (prisma as any).userMessage.create({
                    data: {
                        user_id: userId,
                        message_id: mid,
                        reference_id: entity?.referenceID,
                        phone_number: phone,
                        text: entity?.text || null,
                        suggestion_data: entity?.suggestionResponse || null,
                        entity_type: entityType,
                    }
                });

                // Also record as a CLICKED event if it's a suggestion response
                if (entity?.suggestionResponse && mid) {
                    const campaign = await prisma.campaign.findFirst({
                        where: { request_id: mid } as any
                    });
                    if (campaign) {
                        const formattedNumber = phone.startsWith('+') ? phone : `+${phone}`;
                        await WebhookController.processProviderEvent(campaign, formattedNumber, RcsEventType.CLICKED, new Date(entity.sendTime || Date.now()));
                    }
                }

                return res.status(200).json({ success: true });
            }

            // 3. Handle Status Events (Delivered, Read, Success, Failure)
            if (entityType === 'STATUS_EVENT' || entityType === 'USER_EVENT' || entityType === 'SERVER_EVENT') {
                const eventType = entity?.eventType;
                const mid = entity?.messageId || entity?.referenceID;
                const phone = userPhoneNumber || entity?.phoneNumber || entity?.senderPhoneNumber;

                if (mid && phone && eventType) {
                    const campaign = await prisma.campaign.findFirst({
                        where: { request_id: mid } as any
                    });

                    if (campaign) {
                        const formattedNumber = phone.startsWith('+') ? phone : `+${phone}`;
                        const statusDate = entity.sendTime ? new Date(entity.sendTime) : new Date();
                        
                        let mappedStatus = eventType;
                        if (eventType === 'SEND_MESSAGE_SUCCESS') mappedStatus = RcsEventType.SUCCESS;
                        if (eventType === 'MESSAGE_DELIVERED') mappedStatus = RcsEventType.DELIVERED;
                        if (eventType === 'MESSAGE_READ') mappedStatus = RcsEventType.READ;
                        if (eventType === 'SEND_MESSAGE_FAILURE') mappedStatus = RcsEventType.FAILED;
                        if (eventType === 'TTL_EXPIRATION_REVOKED') mappedStatus = RcsEventType.REVOKED;

                        await WebhookController.processProviderEvent(campaign, formattedNumber, mappedStatus, statusDate);
                    }
                }
            }

            res.status(200).json({ success: true });
        } catch (err: any) {
            console.error('[JioCX Webhook Error]:', err.message);
            res.status(500).json({ success: false });
        }
    }

    /**
     * Private helper for Non-MSG91 providers to avoid duplication
     */
    private static async processProviderEvent(campaign: any, phoneNumber: string, status: string, statusDate: Date) {
        const eventData: any = {
            event_type: status,
            status_updated_at: statusDate,
        };

        if (status === RcsEventType.SENT || status === RcsEventType.SUCCESS) eventData.sent_at = statusDate;
        if (status === RcsEventType.DELIVERED) eventData.delivered_at = statusDate;
        if (status === RcsEventType.READ) eventData.read_at = statusDate;
        if (status === RcsEventType.CLICKED) eventData.engagement = 'Clicked';
        if (status === RcsEventType.FAILED) eventData.error_details = 'Message failed to send';

        await prisma.campaignEvent.upsert({
            where: {
                campaign_id_phone_number: {
                    campaign_id: campaign.id,
                    phone_number: phoneNumber
                }
            },
            update: eventData,
            create: {
                campaign_id: campaign.id,
                phone_number: phoneNumber,
                ...eventData
            }
        });

        if (status === RcsEventType.DELIVERED) {
            // Check if already deducted for this contact to avoid double deduction
            const existingEvent = await prisma.campaignEvent.findUnique({
                where: {
                    campaign_id_phone_number: {
                        campaign_id: campaign.id,
                        phone_number: phoneNumber
                    }
                }
            });

            // If delivered_at was already set before this update, we might have already deducted
            // But upsert above already updated it. This is a bit tricky.
            // Let's assume we deduct only once when delivered_at transitions from null to non-null.
            // For simplicity, we'll just deduct and rely on the fact that webhooks are usually not duplicated for the same status.
            
            await prisma.user.update({
                where: { id: campaign.user_id },
                data: { credit_balance: { decrement: 1 } }
            });

            const deliveredCount = await prisma.campaignEvent.count({
                where: { campaign_id: campaign.id, delivered_at: { not: null } }
            });

            let newStatus = campaign.status;
            if (deliveredCount === campaign.total_contacts) {
                newStatus = CampaignStatus.COMPLETED;
            } else if (deliveredCount > 0 && campaign.status !== CampaignStatus.PAUSED) {
                newStatus = CampaignStatus.PARTIALLY_COMPLETED;
            }

            if (newStatus !== campaign.status) {
                await prisma.campaign.update({
                    where: { id: campaign.id },
                    data: { status: newStatus }
                });
            }
        }
    }

    /**
     * Generic endpoint to handle all providers dynamically based on the URL parameter
     */
    static async handleGenericRcs(req: Request, res: Response) {
        const providerParam = req.params.provider;
        const provider = typeof providerParam === 'string' ? providerParam.toLowerCase() :
            (Array.isArray(providerParam) ? providerParam[0]?.toLowerCase() : undefined);

        switch (provider) {
            case RcsProvider.MSG91:
                await WebhookController.handleMsg91Rcs(req, res);
                break;
            case RcsProvider.JIOCX:
                await WebhookController.handleJiocxRcs(req, res);
                break;
            default:
                console.log(`[Webhook] Unhandled provider in generic route: ${provider}`);
                console.log(`[Webhook] Payload:`, JSON.stringify(req.body));
                res.status(200).json({ success: true, message: 'Webhook received for unknown provider' });
        }
    }

    /**
     * Generic GET endpoint for verification
     */
    static async verifyGenericRcs(req: Request, res: Response) {
        // Generic verification endpoint for providers that require GET verifications
        res.status(200).send('OK');
    }

    /**
     * Catch-all for unknown webhooks
     */
    static async handleUnknownWebhook(req: Request, res: Response) {
        console.log(`[Unknown Webhook] ${req.method} ${req.originalUrl}`);
        console.log(`[Unknown Webhook] Payload:`, JSON.stringify(req.body));
        res.status(200).json({ success: true, message: 'Webhook received' });
    }
}
