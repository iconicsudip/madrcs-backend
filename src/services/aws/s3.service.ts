import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

class AWSService {
    private s3Client: S3Client;
    private bucketName: string;
    private region: string;

    constructor() {
        this.region = process.env.AWS_REGION || 'ap-south-1';
        this.bucketName = process.env.AWS_S3_BUCKET_NAME || '';

        this.s3Client = new S3Client({
            region: this.region,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
            },
        });

        if (!this.bucketName) {
            console.warn("AWS_S3_BUCKET_NAME is not defined in environment variables");
        }
    }

    /**
     * Uploads a file to S3 and returns the public URL
     */
    async uploadMedia(file: Express.Multer.File): Promise<string> {
        let fileExtension = file.originalname.split('.').pop()?.toLowerCase();

        // Force .blob (from frontend cropper) to .png
        if (fileExtension === 'blob' || !fileExtension) {
            fileExtension = 'png';
        }

        const env = process.env.NODE_ENV || 'development';
        const key = `rcs/${env}/media/${uuidv4()}.${fileExtension}`;

        const command = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: file.buffer,
            ContentType: fileExtension === 'png' ? 'image/png' : file.mimetype,
        });

        await this.s3Client.send(command);
        return this.getPublicUrl(key);
    }

    /**
     * Generates a permanent public URL for a given S3 key
     */
    getPublicUrl(key: string): string {
        return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
    }

    /**
     * Generates a temporary pre-signed URL for private access (e.g., for 1 hour)
     */
    async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        });
        return await getSignedUrl(this.s3Client, command, { expiresIn });
    }

    /**
     * Helper to extract key from a full S3 URL
     */
    getKeyFromUrl(url: string): string | null {
        try {
            const urlObj = new URL(url);
            // Removes leading slash from pathname
            return urlObj.pathname.substring(1);
        } catch (e) {
            return null;
        }
    }
}

export const awsService = new AWSService();
