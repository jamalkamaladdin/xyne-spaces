import { Router } from 'express';
import { invitationController } from '@/controllers/invitationController';
import { authMiddleware } from '@/middleware/auth';

const router = Router();

// Public routes - no authentication required
router.get('/:id/verify', invitationController.verifyInvitation);

// Protected routes - require authentication.
// createInvitation has no route-level admin gate: the controller enforces
// ADMIN/OWNER for org roles and lets any workspace member invite COMMUNITY_MEMBERs
// (they can join open community workspaces directly anyway).
router.post('/', authMiddleware.authenticate, invitationController.createInvitation);
// Admin: provision a new org + workspace + owner invitation in one shot
router.post('/provision-org', authMiddleware.authenticate, authMiddleware.requireAdminOrOwner, invitationController.provisionOrg,);
// Unified accept — handles OAuth or email+password
router.post('/:id/accept', invitationController.acceptInvitation);

export default router;
