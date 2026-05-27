import json
import os
import time
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key

TABLE_NAME = os.environ.get("TABLE_NAME", "WorkoutRecords")
ALLOWED_USERNAME = os.environ.get("ALLOWED_USERNAME", "admin")
USER_ID = "admin"

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", "http://localhost:5173"),
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Vary": "Origin",
}

SECURITY_HEADERS = {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
}


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj: Any):
        if isinstance(obj, Decimal):
            if obj % 1 == 0:
                return int(obj)
            return float(obj)
        return super().default(obj)


def response(status_code: int, body: Any):
    return {
        "statusCode": status_code,
        "headers": {**CORS_HEADERS, **SECURITY_HEADERS, "Content-Type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False, cls=DecimalEncoder),
    }


def is_allowed_user(event: dict):
    claims = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    )
    username = claims.get("cognito:username") or claims.get("username")
    return username == ALLOWED_USERNAME


def parse_body(event: dict):
    raw_body = event.get("body") or "{}"
    return json.loads(raw_body)


def route_key(event: dict):
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod")
    path = event.get("rawPath") or event.get("path") or "/"
    return method, path


def make_record_id(date: str):
    return f"RECORD#{date.replace('-', '')}#{int(time.time() * 1000)}"


def validate_record(payload: dict):
    date = str(payload.get("date", "")).strip()
    exercise = str(payload.get("exercise", "")).strip()
    reps = payload.get("reps", [])

    try:
        weight = Decimal(str(payload.get("weight")))
    except Exception as exc:
        raise ValueError("weight must be a number") from exc

    if not date or not exercise:
        raise ValueError("date and exercise are required")
    if weight <= 0:
        raise ValueError("weight must be greater than zero")
    if not isinstance(reps, list) or len(reps) == 0:
        raise ValueError("reps must be a non-empty list")

    normalized_reps = []
    for rep in reps:
        value = int(rep)
        if value <= 0:
            raise ValueError("each rep must be greater than zero")
        normalized_reps.append(value)

    return date, exercise, weight, normalized_reps


def create_record(event: dict):
    payload = parse_body(event)
    date, exercise, weight, reps = validate_record(payload)
    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    item = {
        "userId": USER_ID,
        "recordId": make_record_id(date),
        "date": date,
        "exercise": exercise,
        "weight": weight,
        "reps": reps,
        "createdAt": created_at,
    }

    table.put_item(Item=item)
    return response(201, item)


def list_records():
    result = table.query(KeyConditionExpression=Key("userId").eq(USER_ID))
    items = result.get("Items", [])

    while "LastEvaluatedKey" in result:
        result = table.query(
            KeyConditionExpression=Key("userId").eq(USER_ID),
            ExclusiveStartKey=result["LastEvaluatedKey"],
        )
        items.extend(result.get("Items", []))

    items.sort(key=lambda item: (item["date"], item.get("createdAt", "")), reverse=True)
    return response(200, items)


def delete_record(event: dict):
    record_id = (event.get("pathParameters") or {}).get("recordId")
    if not record_id:
        return response(400, {"message": "recordId is required"})

    table.delete_item(Key={"userId": USER_ID, "recordId": record_id})
    return response(200, {"recordId": record_id})


def lambda_handler(event, context):
    method, path = route_key(event)

    try:
        if method == "OPTIONS":
            return response(200, {"ok": True})
        if not is_allowed_user(event):
            return response(403, {"message": "Forbidden"})
        if method == "POST" and path == "/records":
            return create_record(event)
        if method == "GET" and path == "/records":
            return list_records()
        if method == "DELETE" and path.startswith("/records/"):
            return delete_record(event)
        return response(404, {"message": "Not found"})
    except ValueError as exc:
        return response(400, {"message": str(exc)})
    except Exception:
        return response(500, {"message": "Internal server error"})
