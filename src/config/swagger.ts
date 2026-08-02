import { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import fs from 'fs';
import { env } from './env';

// Safely locate json-schema.json across dev (src) and prod (dist) builds
let prismaModels = {};
const schemaPaths = [
  path.join(__dirname, '..', 'schemas', 'json-schema.json'),
  path.join(process.cwd(), 'src', 'schemas', 'json-schema.json'),
  path.join(process.cwd(), 'dist', 'schemas', 'json-schema.json'),
];

for (const schemaPath of schemaPaths) {
  if (fs.existsSync(schemaPath)) {
    try {
      const rawSchema = fs.readFileSync(schemaPath, 'utf-8');
      const fixedSchema = rawSchema.replace(/#\/definitions\//g, '#/components/schemas/');
      const parsed = JSON.parse(fixedSchema);
      prismaModels = parsed.definitions || {};
      break;
    } catch (err) {
      console.warn('[Swagger] Failed to parse JSON schema:', err);
    }
  }
}

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Trace 1.0 API',
      version: '1.0.0',
      description:
        'Backend API for Trace 1.0 — Desktop Agent communication, shift management, app tracking, subscriptions, and superadmin management.',
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: 'Local dev server',
      },
    ],
    components: {
      schemas: prismaModels,
      securitySchemes: {
        AgentToken: {
          type: 'apiKey',
          in: 'header',
          name: 'x-agent-token',
          description: 'Electron desktop agent token (from User.agentToken)',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token from /api/auth/*/login',
        },
      },
    },
  },
  apis: [
    path.join(__dirname, '..', 'routes', '*.ts'),
    path.join(__dirname, '..', 'routes', '*.js'),
  ],
});

export function setupSwagger(app: Express) {
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Trace 1.0 — API Docs',
    })
  );

  // Expose raw spec
  app.get('/api/docs.json', (_req, res) => {
    res.json(swaggerSpec);
  });
}
