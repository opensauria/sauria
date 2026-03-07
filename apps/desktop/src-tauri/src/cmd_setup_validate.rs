use serde::Serialize;

#[derive(Serialize)]
pub(crate) struct ValidateResult {
    pub(crate) valid: bool,
    pub(crate) error: Option<String>,
}

pub(crate) async fn validate_api_key(provider: &str, api_key: &str) -> ValidateResult {
    let valid_providers = ["anthropic", "openai", "google", "ollama"];
    if !valid_providers.contains(&provider) {
        return ValidateResult { valid: false, error: Some("Unknown provider".to_string()) };
    }

    let key_pattern = regex::Regex::new(r"^[A-Za-z0-9_\-.]+$").unwrap();
    if api_key.is_empty() || api_key.len() > 256 || !key_pattern.is_match(api_key) {
        return ValidateResult { valid: false, error: Some("Invalid API key format".to_string()) };
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap_or_default();

    match provider {
        "anthropic" => validate_anthropic(&client, api_key).await,
        "openai" => validate_openai(&client, api_key).await,
        "google" => validate_google(&client, api_key).await,
        _ => ValidateResult { valid: true, error: None },
    }
}

async fn validate_anthropic(client: &reqwest::Client, api_key: &str) -> ValidateResult {
    let body = serde_json::json!({
        "model": "claude-sonnet-4-5-20250929",
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "hi"}]
    });
    match client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
    {
        Ok(res) => {
            let status = res.status();
            ValidateResult {
                valid: status.is_success() || status.as_u16() == 400,
                error: if status.is_success() { None } else { res.text().await.ok() },
            }
        }
        Err(e) => ValidateResult { valid: false, error: Some(e.to_string()) },
    }
}

async fn validate_openai(client: &reqwest::Client, api_key: &str) -> ValidateResult {
    match client
        .get("https://api.openai.com/v1/models")
        .bearer_auth(api_key)
        .send()
        .await
    {
        Ok(res) => ValidateResult {
            valid: res.status().is_success(),
            error: if res.status().is_success() { None } else { res.text().await.ok() },
        },
        Err(e) => ValidateResult { valid: false, error: Some(e.to_string()) },
    }
}

async fn validate_google(client: &reqwest::Client, api_key: &str) -> ValidateResult {
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models?key={api_key}");
    match client.get(&url).send().await {
        Ok(res) => ValidateResult {
            valid: res.status().is_success(),
            error: if res.status().is_success() { None } else { res.text().await.ok() },
        },
        Err(e) => ValidateResult { valid: false, error: Some(e.to_string()) },
    }
}
