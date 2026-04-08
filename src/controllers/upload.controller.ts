import { Request, Response } from 'express';
import { awsService } from '../services/aws/s3.service';

export const uploadMedia = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file provided' });
        }

        const url = await awsService.uploadMedia(req.file);
        
        return res.status(200).json({
            success: true,
            url: url,
            message: 'Media uploaded successfully'
        });
    } catch (error: any) {
        console.error('[Upload Controller] Error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'File upload failed'
        });
    }
};
