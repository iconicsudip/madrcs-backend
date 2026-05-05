import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { RcsEventType, CampaignStatus } from '../enums/rcs.enum';

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
                        msg91_request_id: requestId
                    }
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
     * Google RBM Verification
     */
    static async verifyGoogleRcs(req: Request, res: Response) {
        const clientToken = req.query.clientToken;
        if (clientToken) {
            return res.status(200).send(clientToken);
        }
        return res.status(400).send('Missing clientToken');
    }

    /**
     * Handle Google RBM events
     */
    static async handleGoogleRcs(req: Request, res: Response) {
        try {
            const payload = req.body;
            console.log('[Webhook] Received Google RBM Event:', JSON.stringify(payload));

            const event = payload; 
            const { messageId, eventType, senderPhoneNumber, eventTime } = event;

            if (messageId && eventType) {
                let status = eventType.toUpperCase();
                const formattedNumber = senderPhoneNumber.startsWith('+') ? senderPhoneNumber : `+${senderPhoneNumber}`;

                const campaign = await prisma.campaign.findFirst({
                    where: { msg91_request_id: messageId }
                });

                if (campaign) {
                    const statusDate = eventTime ? new Date(eventTime) : new Date();
                    await WebhookController.processProviderEvent(campaign, formattedNumber, status, statusDate);
                }
            }

            res.status(200).json({ success: true });
        } catch (err: any) {
            console.error('[Google Webhook Error]:', err.message);
            res.status(500).json({ success: false });
        }
    }

    /**
     * Handle Dotgo RCS events
     */
    static async handleDotgoRcs(req: Request, res: Response) {
        try {
            const payload = req.body;
            console.log('[Webhook] Received Dotgo RCS Event:', JSON.stringify(payload));

            const { id, status, msisdn, timestamp } = payload;

            if (id && msisdn) {
                const formattedNumber = msisdn.startsWith('+') ? msisdn : `+${msisdn}`;
                const campaign = await prisma.campaign.findFirst({
                    where: { msg91_request_id: id }
                });

                if (campaign) {
                    await WebhookController.processProviderEvent(campaign, formattedNumber, status.toUpperCase(), timestamp ? new Date(timestamp) : new Date());
                }
            }

            res.status(200).json({ success: true });
        } catch (err: any) {
            console.error('[Dotgo Webhook Error]:', err.message);
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

        if (status === RcsEventType.SENT) eventData.sent_at = statusDate;
        if (status === RcsEventType.DELIVERED) eventData.delivered_at = statusDate;
        if (status === RcsEventType.READ) eventData.read_at = statusDate;
        if (status === RcsEventType.CLICKED) eventData.engagement = 'Clicked';

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
}
