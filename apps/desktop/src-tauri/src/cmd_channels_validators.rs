use serde_json::Value;

use crate::cmd_channels::{extract_required_creds, ConnectionResult};

pub(crate) fn validate_google_chat<'a>(
    creds: &'a Value,
    _client: &'a reqwest::Client,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<ConnectionResult, Value>> + Send + 'a>>
{
    Box::pin(async move {
        let vals = extract_required_creds(creds, &["serviceAccountKey"], "Service Account Key (JSON) required")?;
        let sa_key = vals[0].as_str();
        let space_id = creds.get("spaceId").and_then(|v| v.as_str()).unwrap_or("");

        let key_json: Value = serde_json::from_str(sa_key)
            .map_err(|_| serde_json::json!({"success": false, "error": "Invalid JSON in service account key"}))?;

        let client_email = key_json.get("client_email").and_then(|v| v.as_str()).unwrap_or("");
        if client_email.is_empty() {
            return Err(serde_json::json!({"success": false, "error": "Service account key must contain client_email"}));
        }

        let sa_id = client_email.split('@').next().unwrap_or("gchat");
        let node_id = format!("gchat_{sa_id}");

        let mut entries = vec![(format!("channel_token_{node_id}"), sa_key.to_string())];
        if !space_id.is_empty() {
            entries.push((format!("channel_space_{node_id}"), space_id.to_string()));
        }

        Ok(ConnectionResult {
            node_id,
            display_name: "Google Chat".to_string(),
            extra: Value::Object(Default::default()),
            vault_entries: entries,
            config_patch: None,
            profile: None,
        })
    })
}

pub(crate) fn validate_twilio<'a>(
    creds: &'a Value,
    client: &'a reqwest::Client,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<ConnectionResult, Value>> + Send + 'a>>
{
    Box::pin(async move {
        let vals = extract_required_creds(creds, &["accountSid", "authToken", "phoneNumber"], "Account SID, Auth Token, and Phone Number required")?;
        let (account_sid, auth_token, phone_number) = (vals[0].as_str(), vals[1].as_str(), vals[2].as_str());

        let res = client
            .get(format!("https://api.twilio.com/2010-04-01/Accounts/{account_sid}.json"))
            .basic_auth(account_sid, Some(auth_token))
            .send()
            .await
            .map_err(|e| serde_json::json!({"success": false, "error": e.to_string()}))?;

        if !res.status().is_success() {
            return Err(serde_json::json!({"success": false, "error": "Invalid Twilio credentials"}));
        }

        let body: Value = res.json().await
            .map_err(|e| serde_json::json!({"success": false, "error": e.to_string()}))?;
        let friendly_name = body.get("friendly_name").and_then(|v| v.as_str()).unwrap_or(phone_number);

        let phone_clean = phone_number.replace('+', "").replace('-', "").replace(' ', "");
        let node_id = format!("twilio_{phone_clean}");

        Ok(ConnectionResult {
            node_id: node_id.clone(),
            display_name: friendly_name.to_string(),
            extra: Value::Object(Default::default()),
            vault_entries: vec![
                (format!("channel_token_{node_id}"), auth_token.to_string()),
                (format!("channel_sid_{node_id}"), account_sid.to_string()),
            ],
            config_patch: None,
            profile: None,
        })
    })
}

pub(crate) fn validate_matrix<'a>(
    creds: &'a Value,
    client: &'a reqwest::Client,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<ConnectionResult, Value>> + Send + 'a>>
{
    Box::pin(async move {
        let vals = extract_required_creds(creds, &["homeserverUrl", "accessToken"], "Homeserver URL and Access Token required")?;
        let (homeserver, access_token) = (vals[0].as_str(), vals[1].as_str());

        let hs = homeserver.trim_end_matches('/');
        let res = client
            .get(format!("{hs}/_matrix/client/v3/account/whoami"))
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| serde_json::json!({"success": false, "error": e.to_string()}))?;

        if !res.status().is_success() {
            return Err(serde_json::json!({"success": false, "error": "Invalid Matrix credentials"}));
        }

        let body: Value = res.json().await
            .map_err(|e| serde_json::json!({"success": false, "error": e.to_string()}))?;
        let user_id = body.get("user_id").and_then(|v| v.as_str()).unwrap_or("");

        let clean_id = user_id.trim_start_matches('@').replace(':', "_");
        let node_id = format!("matrix_{clean_id}");

        Ok(ConnectionResult {
            node_id: node_id.clone(),
            display_name: user_id.to_string(),
            extra: Value::Object(Default::default()),
            vault_entries: vec![
                (format!("channel_token_{node_id}"), access_token.to_string()),
                (format!("channel_homeserver_{node_id}"), hs.to_string()),
            ],
            config_patch: None,
            profile: None,
        })
    })
}
