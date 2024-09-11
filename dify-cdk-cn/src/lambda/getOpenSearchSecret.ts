// src/lambda/getOpenSearchSecret.ts
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

const secretsManager = new SecretsManager();

export const handler = async (event: any) => {
    const secretName = process.env.OPENSEARCH_SECRET_NAME;

    if (!secretName) {
        throw new Error('OPENSEARCH_SECRET_NAME environment variable is not set');
    }

    try {
        const data = await secretsManager.getSecretValue({ SecretId: secretName });

        if (data.SecretString) {
            const secret = JSON.parse(data.SecretString);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    username: secret.username,
                    password: secret.password,
                }),
            };
        } else {
            throw new Error('Secret is not a string');
        }
    } catch (error) {
        console.error('Error retrieving secret:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error retrieving secret' }),
        };
    }
};
