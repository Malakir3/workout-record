import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

cognito_client = boto3.client('cognito-idp')

PASSKEY_REQUIRED_MESSAGE = (
    "PasskeyAuthenticationRequired: このアカウントはパスキーが登録されているため、"
    "パスワードでのログインは利用できません。パスキーを使用してログインしてください。"
)


def _is_passkey_auth(event):
    request = event.get('request', {})
    for metadata in (request.get('validationData') or {}, request.get('clientMetadata') or {}):
        if metadata.get('authMethod') == 'passkey':
            return True
    return False


def _attributes_to_dict(attributes):
    return {attr['Name']: attr['Value'] for attr in attributes}


def lambda_handler(event, context):
    logger.info("Received event: %s", event)

    if _is_passkey_auth(event):
        logger.info("Authentication using Passkey, bypassing password restriction check.")
        return event

    user_pool_id = event['userPoolId']
    username = event['userName']

    try:
        response = cognito_client.admin_get_user(
            UserPoolId=user_pool_id,
            Username=username,
        )
        attributes = _attributes_to_dict(response.get('UserAttributes', []))

        if attributes.get('custom:has_passkey') == 'true':
            logger.warning(
                "User %s attempted password login but has passkey registration enabled. Denying.",
                username,
            )
            raise Exception(PASSKEY_REQUIRED_MESSAGE)

    except cognito_client.exceptions.UserNotFoundException:
        logger.info("User %s not found, letting Cognito handle it.", username)
    except Exception as e:
        if "PasskeyAuthenticationRequired" in str(e):
            raise
        logger.error("Unexpected error checking passkey registration status: %s", str(e))
        raise Exception(
            "PasskeyAuthenticationRequired: 認証方式の確認に失敗しました。"
            "しばらくしてから再度お試しください。"
        ) from e

    return event
