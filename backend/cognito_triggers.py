import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

cognito_client = boto3.client('cognito-idp')

def lambda_handler(event, context):
    logger.info("Received event: %s", event)
    
    # ログインに使用されている認証方法を判定する
    # クライアントから渡された clientMetadata (validationData) を確認する
    validation_data = event.get('request', {}).get('validationData') or {}
    auth_method = validation_data.get('authMethod')
    
    # もしクライアントが明示的にパスキーによる認証 (passkey) を指定している場合は、チェックを行わず通過させる
    if auth_method == 'passkey':
        logger.info("Authentication using Passkey, bypassing password restriction check.")
        return event

    user_pool_id = event['userPoolId']
    username = event['userName']
    
    try:
        # ユーザーに登録されている WebAuthn パスキー（認証情報）のリストを取得する
        response = cognito_client.list_web_authn_credentials(
            UserPoolId=user_pool_id,
            Username=username,
            Limit=1
        )
        credentials = response.get('Credentials', [])
        
        # パスキーが1つ以上登録されており、今回の認証がパスキーによるものでない（＝パスワードによる認証）場合、拒否する
        if len(credentials) > 0:
            logger.warning("User %s attempted password login, but they have registered passkey(s). Denying access.", username)
            raise Exception("PasskeyAuthenticationRequired: このアカウントはパスキーが登録されているため、パスワードでのログインは利用できません。パスキーを使用してログインしてください。")
            
    except cognito_client.exceptions.UserNotFoundException:
        logger.info("User %s not found during validation, letting Cognito handle user validation.", username)
        pass
    except Exception as e:
        # パスキー必須例外はそのまま上に投げる（Cognitoがキャッチして認証を中断する）
        if "PasskeyAuthenticationRequired" in str(e):
            raise e
        # API権限エラーやその他のエラーの場合、認証自体を完全に止めてしまわないようログ出力だけして通過させる（フォールバック）
        logger.error("Error during checking WebAuthn credentials: %s", str(e))
        
    return event
