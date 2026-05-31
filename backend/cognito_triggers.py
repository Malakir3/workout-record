import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

cognito_client = boto3.client('cognito-idp')

def lambda_handler(event, context):
    logger.info("Received event: %s", event)

    # クライアントから渡された validationData を確認する
    validation_data = event.get('request', {}).get('validationData') or {}
    auth_method = validation_data.get('authMethod')

    # パスキーによる認証の場合はチェックをスキップして通過させる
    if auth_method == 'passkey':
        logger.info("Authentication using Passkey, bypassing password restriction check.")
        return event

    user_pool_id = event['userPoolId']
    username = event['userName']

    try:
        # 管理者 API でユーザーのパスキー登録状況を確認する
        response = cognito_client.admin_list_web_authn_credentials(
            UserPoolId=user_pool_id,
            Username=username,
        )
        credentials = response.get('Credentials', [])

        # パスキーが1つ以上登録されており、パスキー以外の認証（＝パスワード）の場合、拒否する
        if len(credentials) > 0:
            logger.warning(
                "User %s attempted password login but has %d registered passkey(s). Denying.",
                username, len(credentials)
            )
            raise Exception(
                "PasskeyAuthenticationRequired: このアカウントはパスキーが登録されているため、"
                "パスワードでのログインは利用できません。パスキーを使用してログインしてください。"
            )

    except cognito_client.exceptions.UserNotFoundException:
        logger.info("User %s not found, letting Cognito handle it.", username)
    except Exception as e:
        if "PasskeyAuthenticationRequired" in str(e):
            raise
        # 権限エラー等の予期しない例外はログに残してスルー（認証フローを止めない）
        logger.error("Unexpected error checking WebAuthn credentials: %s", str(e))

    return event
