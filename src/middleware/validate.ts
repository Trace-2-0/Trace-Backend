import { Request, Response, NextFunction } from 'express';
import { z, ZodType } from 'zod';

// ────────────────────────────────────────────────────────────
// Generic Zod validation middleware
// Usage: validate({ body: someZodSchema, params: anotherSchema })
// ────────────────────────────────────────────────────────────

interface ValidationTarget {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

export function validate(schemas: ValidationTarget) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: Record<string, string[]> = {};

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        errors.body = result.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`
        );
      } else {
        req.body = result.data;
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        errors.params = result.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`
        );
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        errors.query = result.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`
        );
      }
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    next();
  };
}
