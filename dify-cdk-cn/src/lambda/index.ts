import { SecretsManager } from '@aws-sdk/client-secrets-manager';

const secretsManager = new SecretsManager();

export const handler = async (event: any) => {
    const rdsSecretName = process.env.RDS_SECRET_NAME;

    if (!rdsSecretName) {
        throw new Error('RDS_SECRET_NAME environment variable is not set');
    }

    try {
        const data = await secretsManager.getSecretValue({ SecretId: rdsSecretName });

        if (data.SecretString) {
            const secret = JSON.parse(data.SecretString);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    host: secret.host,
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
