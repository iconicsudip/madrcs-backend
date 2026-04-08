import { Router } from 'express';
import multer from 'multer';
import { uploadMedia } from '../controllers/upload.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    }
});

// POST /api/upload/media - Protected route
router.post('/media', authenticate, upload.single('media'), uploadMedia);

export default router;
