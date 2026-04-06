import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';

// ────────────────────────────────────────────────────────────
// Global Error Handler
// Maps Prisma errors + general errors to structured JSON
// ────────────────────────────────────────────────────────────

export const errorHandler: ErrorRequestHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('[Error]', err.message || err);

  // Prisma: Unique constraint violation
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join(', ') || 'field';
      res.status(409).json({ error: `Duplicate value on: ${target}` });
      return;
    }

    // Record not found
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Record not found' });
      return;
    }

    // Foreign key constraint failed
    if (err.code === 'P2003') {
      res.status(400).json({ error: 'Referenced record does not exist' });
      return;
    }
  }

  // Prisma: Validation error
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({ error: 'Invalid data format' });
    return;
  }

  // JSON parse error
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON in request body' });
    return;
  }

  // Payload too large
  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body too large (max 10MB)' });
    return;
  }

  // Default
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : err.message || 'Something went wrong',
  });
};
